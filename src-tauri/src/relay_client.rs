use chrono::{Local, NaiveDate, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::db::DbError;
use crate::engine::{
    calculate_7day_lookahead, DayLookahead, InterestInputMode, LoanTerms,
    PaymentRecord, WaiverRecord,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotLoanCard {
    pub loan_id: String,
    pub name: String,
    pub photo: Option<String>,
    pub locality: String,
    pub phone_last4: String,
    pub assigned_collector: Option<String>,
    pub lookahead: Vec<DayLookahead>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutboxSnapshot {
    pub published_at: String,
    pub active_loans: Vec<SnapshotLoanCard>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelaySubmission {
    pub id: String,
    pub loan_id: String,
    pub principal_amount: i64,
    pub fine_amount: i64,
    pub mode: String,
    pub reference: Option<String>,
    pub collected_at: String,
    pub collector_id: String,
    pub received_at: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct PendingInboxResponse {
    pub success: bool,
    pub count: usize,
    pub submissions: Vec<RelaySubmission>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub pulled_count: usize,
    pub acknowledged_count: usize,
    pub published_loans_count: usize,
    pub published_at: String,
}

/// Generates the minimal read-only customer snapshot per ADR-001 (line 72).
/// Strictly excludes Aadhaar, guarantor details, and totals.
pub fn generate_outbox_snapshot(conn: &Connection) -> Result<OutboxSnapshot, DbError> {
    let mut stmt = conn.prepare(
        r#"
        SELECT l.id, p.name, p.photo, p.address, p.phone, c.username,
               l.loan_amount, l.interest_amount, l.interest_input_mode, l.day_amount, l.fine_per_missed_day, l.start_date
        FROM loans l
        JOIN persons p ON l.customer_id = p.id
        LEFT JOIN collectors c ON l.assigned_collector_id = c.id
        WHERE l.status = 'active'
        ORDER BY p.name ASC
        "#,
    )?;

    let today = Local::now().date_naive();
    let mut active_loans = Vec::new();

    let rows = stmt.query_map([], |row| {
        let loan_id: String = row.get(0)?;
        let name: String = row.get(1)?;
        let photo: Option<String> = row.get(2)?;
        let address: String = row.get(3)?;
        let phone: String = row.get(4)?;
        let assigned_collector: Option<String> = row.get(5)?;

        let loan_amount: i64 = row.get(6)?;
        let interest_amount: i64 = row.get(7)?;
        let mode_str: String = row.get(8)?;
        let day_amount: i64 = row.get(9)?;
        let fine_per_missed_day: i64 = row.get(10)?;
        let start_date_str: String = row.get(11)?;

        Ok((
            loan_id,
            name,
            photo,
            address,
            phone,
            assigned_collector,
            loan_amount,
            interest_amount,
            mode_str,
            day_amount,
            fine_per_missed_day,
            start_date_str,
        ))
    })?;

    for r in rows {
        let (
            loan_id,
            name,
            photo,
            address,
            phone,
            assigned_collector,
            loan_amount,
            interest_amount,
            mode_str,
            day_amount,
            fine_per_missed_day,
            start_date_str,
        ) = r?;

        // Extract last 4 digits of phone for privacy
        let phone_clean: String = phone.chars().filter(|c| c.is_ascii_digit()).collect();
        let phone_last4 = if phone_clean.len() >= 4 {
            phone_clean[phone_clean.len() - 4..].to_string()
        } else {
            phone_clean
        };

        // Locality: take first part of address before comma
        let locality = address.split(',').next().unwrap_or(&address).trim().to_string();

        let start_date = NaiveDate::parse_from_str(&start_date_str, "%Y-%m-%d")
            .unwrap_or(today);

        let terms = LoanTerms {
            id: loan_id.clone(),
            customer_id: String::new(),
            loan_amount,
            interest_amount,
            interest_input_mode: if mode_str == "percent" {
                InterestInputMode::Percent
            } else {
                InterestInputMode::Rupee
            },
            day_amount,
            fine_per_missed_day,
            start_date,
        };

        // Load payments and waivers to compute 7-day lookahead
        let mut pay_stmt = conn.prepare(
            "SELECT id, loan_id, principal_amount, fine_amount, collected_at, status FROM payments WHERE loan_id = ?1",
        )?;
        let pay_rows = pay_stmt.query_map(params![loan_id], |p_row| {
            let d_str: String = p_row.get(4)?;
            let d = NaiveDate::parse_from_str(&d_str[..10], "%Y-%m-%d").unwrap_or(today);
            Ok(PaymentRecord {
                id: p_row.get(0)?,
                loan_id: p_row.get(1)?,
                principal_amount: p_row.get(2)?,
                fine_amount: p_row.get(3)?,
                collected_at: d,
                status: p_row.get(5)?,
            })
        })?;
        let mut payments = Vec::new();
        for p in pay_rows {
            payments.push(p?);
        }

        let mut waive_stmt = conn.prepare(
            "SELECT id, loan_id, amount, date, reason FROM fine_waivers WHERE loan_id = ?1",
        )?;
        let waive_rows = waive_stmt.query_map(params![loan_id], |w_row| {
            let d_str: String = w_row.get(3)?;
            let d = NaiveDate::parse_from_str(&d_str[..10], "%Y-%m-%d").unwrap_or(today);
            Ok(WaiverRecord {
                id: w_row.get(0)?,
                loan_id: w_row.get(1)?,
                amount: w_row.get(2)?,
                date: d,
                reason: w_row.get(4)?,
            })
        })?;
        let mut waivers = Vec::new();
        for w in waive_rows {
            waivers.push(w?);
        }

        let lookahead = calculate_7day_lookahead(&terms, &payments, &waivers, today);

        active_loans.push(SnapshotLoanCard {
            loan_id,
            name,
            photo,
            locality,
            phone_last4,
            assigned_collector,
            lookahead,
        });
    }

    Ok(OutboxSnapshot {
        published_at: Utc::now().to_rfc3339(),
        active_loans,
    })
}

/// Executes the full pull protocol:
/// 1. Fetch pending submissions from relay.
/// 2. Insert into SQLite in one transaction (idempotent via processed_submissions).
/// 3. Acknowledge and purge on relay only after transaction commits.
/// 4. Publish fresh snapshot to relay outbox.
pub async fn sync_relay(
    conn_mutex: &std::sync::Arc<std::sync::Mutex<Option<Connection>>>,
    relay_url: &str,
    admin_secret: &str,
) -> Result<SyncResult, String> {
    let client = reqwest::Client::new();
    let base_url = relay_url.trim_end_matches('/');

    // 1. Fetch pending submissions
    let pending_url = format!("{base_url}/api/inbox/pending");
    let resp = client
        .get(&pending_url)
        .header("Authorization", format!("Bearer {admin_secret}"))
        .send()
        .await
        .map_err(|e| format!("Failed to connect to relay pending inbox: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Relay error: HTTP {}", resp.status()));
    }

    let inbox_data: PendingInboxResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse relay inbox response: {e}"))?;

    let mut successfully_inserted_ids = Vec::new();

    // 2. Insert into local SQLite inside transaction
    {
        let mut guard = conn_mutex.lock().unwrap();
        let conn = guard.as_mut().ok_or_else(|| "Database is locked".to_string())?;

        let tx = conn
            .transaction()
            .map_err(|e| format!("Failed to start transaction: {e}"))?;

        for sub in &inbox_data.submissions {
            // Check if already processed
            let already_processed: bool = tx
                .query_row(
                    "SELECT 1 FROM processed_submissions WHERE submission_id = ?1",
                    params![sub.id],
                    |_| Ok(true),
                )
                .unwrap_or(false);

            if !already_processed {
                // Insert into payments
                tx.execute(
                    r#"
                    INSERT INTO payments (
                        id, loan_id, collected_at, received_at, principal_amount, fine_amount,
                        mode, reference, collected_by, status
                    )
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'collected')
                    "#,
                    params![
                        sub.id,
                        sub.loan_id,
                        sub.collected_at,
                        sub.received_at,
                        sub.principal_amount,
                        sub.fine_amount,
                        sub.mode,
                        sub.reference,
                        sub.collector_id
                    ],
                )
                .map_err(|e| format!("Failed to insert payment {}: {e}", sub.id))?;

                // Mark processed
                tx.execute(
                    "INSERT INTO processed_submissions (submission_id, received_time) VALUES (?1, ?2)",
                    params![sub.id, sub.received_at],
                )
                .map_err(|e| format!("Failed to mark submission {}: {e}", sub.id))?;
            }

            successfully_inserted_ids.push(sub.id.clone());
        }

        // Commit local transaction
        tx.commit()
            .map_err(|e| format!("Failed to commit local database transaction: {e}"))?;
    }

    // 3. Acknowledge processed IDs on the relay (delete from inbox)
    let mut ack_count = 0;
    if !successfully_inserted_ids.is_empty() {
        let ack_url = format!("{base_url}/api/inbox/ack");
        let ack_resp = client
            .post(&ack_url)
            .header("Authorization", format!("Bearer {admin_secret}"))
            .json(&serde_json::json!({
                "submission_ids": successfully_inserted_ids
            }))
            .send()
            .await;

        if let Ok(r) = ack_resp {
            if r.status().is_success() {
                ack_count = successfully_inserted_ids.len();
            }
        }
    }

    // 4. Generate and publish fresh snapshot to outbox
    let snapshot = {
        let guard = conn_mutex.lock().unwrap();
        let conn = guard.as_ref().ok_or_else(|| "Database is locked".to_string())?;
        generate_outbox_snapshot(conn).map_err(|e| e.to_string())?
    };

    let snap_url = format!("{base_url}/api/outbox/snapshot");
    let _ = client
        .post(&snap_url)
        .header("Authorization", format!("Bearer {admin_secret}"))
        .json(&snapshot)
        .send()
        .await;

    Ok(SyncResult {
        pulled_count: inbox_data.submissions.len(),
        acknowledged_count: ack_count,
        published_loans_count: snapshot.active_loans.len(),
        published_at: snapshot.published_at,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::DbState;
    use uuid::Uuid;

    #[test]
    fn test_generate_outbox_snapshot_minimal_data() {
        let temp_dir = std::env::temp_dir().join(format!("privolent_snap_{}", Uuid::new_v4()));
        let db_path = temp_dir.join("snap.db");
        let db_state = DbState::new(db_path.clone());
        db_state.unlock_or_initialize("pass123").unwrap();

        db_state
            .with_conn(|conn| {
                let pid = Uuid::new_v4().to_string();
                let lid = Uuid::new_v4().to_string();
                let now = Utc::now().to_rfc3339();

                // Person with sensitive Aadhaar
                conn.execute(
                    "INSERT INTO persons (id, name, aadhaar, address, phone, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![pid, "Amrik Singh", "999988887777", "Shop 12, Main Bazaar, Jalandhar", "9812345678", now, now],
                )?;

                // Active Loan
                conn.execute(
                    r#"
                    INSERT INTO loans (id, customer_id, loan_amount, interest_amount, interest_input_mode, day_amount, fine_per_missed_day, start_date, status, created_at)
                    VALUES (?1, ?2, 10000, 1000, 'percent', 100, 20, '2026-11-01', 'active', ?3)
                    "#,
                    params![lid, pid, now],
                )?;

                let snapshot = generate_outbox_snapshot(conn).unwrap();
                assert_eq!(snapshot.active_loans.len(), 1);

                let card = &snapshot.active_loans[0];
                assert_eq!(card.name, "Amrik Singh");
                assert_eq!(card.locality, "Shop 12");
                assert_eq!(card.phone_last4, "5678"); // last 4 digits only!
                assert_eq!(card.lookahead.len(), 7); // 7-day lookahead included!

                // Assert serialization does NOT contain "aadhaar" or "guarantor"
                let json = serde_json::to_string(&snapshot).unwrap();
                assert!(!json.contains("999988887777"), "Aadhaar must not be in published snapshot!");
                assert!(!json.contains("aadhaar"), "Aadhaar field must not be in published snapshot!");

                Ok(())
            })
            .unwrap();

        db_state.lock();
        let _ = std::fs::remove_dir_all(temp_dir);
    }
}
