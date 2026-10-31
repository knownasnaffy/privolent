use chrono::{Local, NaiveDate, Utc};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::db::{DbError, DbState};
use crate::engine::{
    calculate_7day_lookahead, calculate_loan_state, preview_loan_handover, DayLookahead,
    InterestInputMode, LoanPreview, LoanState, LoanTerms, PaymentRecord, WaiverRecord,
};

#[derive(Debug, Serialize, Deserialize)]
pub struct DbStatus {
    pub is_initialized: bool,
    pub is_unlocked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Person {
    pub id: String,
    pub name: String,
    pub aadhaar: String,
    pub address: String,
    pub phone: String,
    pub alternate_phone: Option<String>,
    pub occupation: Option<String>,
    pub photo: Option<String>,
    pub documents_collected: Option<String>,
    pub remarks: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreatePersonArgs {
    pub name: String,
    pub aadhaar: String,
    pub address: String,
    pub phone: String,
    pub alternate_phone: Option<String>,
    pub occupation: Option<String>,
    pub photo: Option<String>,
    pub documents_collected: Option<String>,
    pub remarks: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePersonArgs {
    pub id: String,
    pub name: String,
    pub aadhaar: String,
    pub address: String,
    pub phone: String,
    pub alternate_phone: Option<String>,
    pub occupation: Option<String>,
    pub photo: Option<String>,
    pub documents_collected: Option<String>,
    pub remarks: Option<String>,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoanItem {
    pub id: String,
    pub customer_id: String,
    pub customer_name: String,
    pub guarantor_id: Option<String>,
    pub guarantor_name: Option<String>,
    pub loan_amount: i64,
    pub interest_amount: i64,
    pub interest_input_mode: String,
    pub day_amount: i64,
    pub fine_per_missed_day: i64,
    pub start_date: String,
    pub assigned_collector_id: Option<String>,
    pub assigned_collector_name: Option<String>,
    pub status: String,
    pub created_at: String,
    pub outstanding_principal: i64,
    pub fine_due: i64,
    pub principal_due_today: i64,
    pub is_settled: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateLoanArgs {
    pub customer_id: String,
    pub guarantor_id: Option<String>,
    pub loan_amount: i64,
    pub interest_value: f64,
    pub is_percent: bool,
    pub day_amount: i64,
    pub fine_per_missed_day: i64,
    pub start_date: String,
    pub assigned_collector_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentItem {
    pub id: String,
    pub loan_id: String,
    pub collected_at: String,
    pub received_at: String,
    pub principal_amount: i64,
    pub fine_amount: i64,
    pub mode: String,
    pub reference: Option<String>,
    pub collected_by: String,
    pub status: String,
    pub decided_at: Option<String>,
    pub reason: Option<String>,
    pub is_delayed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityItem {
    pub id: String,
    pub loan_id: String,
    pub item_type: String,
    pub description: String,
    pub number_or_weight: Option<String>,
    pub bank: Option<String>,
    pub kept_where: Option<String>,
    pub estimated_value: Option<i64>,
    pub status: String,
    pub returned_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateSecurityItemArgs {
    pub loan_id: String,
    pub item_type: String,
    pub description: String,
    pub number_or_weight: Option<String>,
    pub bank: Option<String>,
    pub kept_where: Option<String>,
    pub estimated_value: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LoanDetail {
    pub loan: LoanItem,
    pub state: LoanState,
    pub lookahead: Vec<DayLookahead>,
    pub payments: Vec<PaymentItem>,
    pub waivers: Vec<WaiverRecord>,
    pub security_items: Vec<SecurityItem>,
}

#[derive(Debug, Deserialize)]
pub struct RecordAdminPaymentArgs {
    pub loan_id: String,
    pub principal_amount: i64,
    pub fine_amount: i64,
    pub mode: String,
    pub reference: Option<String>,
    pub collected_at: String,
}

#[derive(Debug, Deserialize)]
pub struct RejectPaymentArgs {
    pub payment_id: String,
    pub reason: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateWaiverArgs {
    pub loan_id: String,
    pub amount: i64,
    pub reason: String,
    pub date: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProfitReport {
    pub start_date: String,
    pub end_date: String,
    pub interest_profit: i64,
    pub fine_profit: i64,
    pub total_profit: i64,
    pub loans_disbursed_count: i64,
    pub principal_collected: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectorAccount {
    pub id: String,
    pub username: String,
    pub active: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuditLogEntry {
    pub id: String,
    pub who: String,
    pub what_changed: String,
    pub before_val: Option<String>,
    pub after_val: Option<String>,
    pub reason: String,
    pub created_at: String,
}

// ---------------- Database Lifecycle ----------------

#[tauri::command]
pub fn get_db_status(state: State<'_, DbState>) -> DbStatus {
    DbStatus {
        is_initialized: state.is_initialized(),
        is_unlocked: state.is_unlocked(),
    }
}

#[tauri::command]
pub fn unlock_database(state: State<'_, DbState>, passphrase: String) -> Result<(), String> {
    state.unlock_or_initialize(&passphrase).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn lock_database(state: State<'_, DbState>) -> Result<(), String> {
    state.lock();
    Ok(())
}

// ---------------- Person Commands ----------------

#[tauri::command]
pub fn create_person(state: State<'_, DbState>, args: CreatePersonArgs) -> Result<Person, String> {
    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();

    state
        .with_conn(|conn| {
            conn.execute(
                r#"
                INSERT INTO persons (id, name, aadhaar, address, phone, alternate_phone, occupation, photo, documents_collected, remarks, created_at, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
                "#,
                params![
                    id,
                    args.name,
                    args.aadhaar,
                    args.address,
                    args.phone,
                    args.alternate_phone,
                    args.occupation,
                    args.photo,
                    args.documents_collected,
                    args.remarks,
                    now,
                    now
                ],
            )?;
            Ok(())
        })
        .map_err(|e| e.to_string())?;

    Ok(Person {
        id,
        name: args.name,
        aadhaar: args.aadhaar,
        address: args.address,
        phone: args.phone,
        alternate_phone: args.alternate_phone,
        occupation: args.occupation,
        photo: args.photo,
        documents_collected: args.documents_collected,
        remarks: args.remarks,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub fn get_persons(state: State<'_, DbState>) -> Result<Vec<Person>, String> {
    state
        .with_conn(|conn| {
            let mut stmt = conn.prepare(
                r#"
                SELECT id, name, aadhaar, address, phone, alternate_phone, occupation, photo, documents_collected, remarks, created_at, updated_at
                FROM persons
                ORDER BY name COLLATE NOCASE ASC
                "#,
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(Person {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    aadhaar: row.get(2)?,
                    address: row.get(3)?,
                    phone: row.get(4)?,
                    alternate_phone: row.get(5)?,
                    occupation: row.get(6)?,
                    photo: row.get(7)?,
                    documents_collected: row.get(8)?,
                    remarks: row.get(9)?,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                })
            })?;

            let mut persons = Vec::new();
            for person in rows {
                persons.push(person?);
            }
            Ok(persons)
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_person(state: State<'_, DbState>, args: UpdatePersonArgs) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();

    state
        .with_conn(|conn| {
            // Fetch current person for audit log
            let prev_json: Option<String> = conn
                .query_row(
                    "SELECT json_object('name', name, 'aadhaar', aadhaar, 'phone', phone, 'address', address) FROM persons WHERE id = ?1",
                    params![args.id],
                    |row| row.get(0),
                )
                .optional()?;

            conn.execute(
                r#"
                UPDATE persons
                SET name = ?1, aadhaar = ?2, address = ?3, phone = ?4, alternate_phone = ?5, occupation = ?6, photo = ?7, documents_collected = ?8, remarks = ?9, updated_at = ?10
                WHERE id = ?11
                "#,
                params![
                    args.name,
                    args.aadhaar,
                    args.address,
                    args.phone,
                    args.alternate_phone,
                    args.occupation,
                    args.photo,
                    args.documents_collected,
                    args.remarks,
                    now,
                    args.id
                ],
            )?;

            // Audit log
            let audit_id = Uuid::new_v4().to_string();
            let after_json = serde_json::to_string(&serde_json::json!({
                "name": args.name,
                "aadhaar": args.aadhaar,
                "phone": args.phone,
                "address": args.address
            }))
            .unwrap_or_default();

            conn.execute(
                r#"
                INSERT INTO audit_log (id, who, what_changed, before_val, after_val, reason, created_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                "#,
                params![
                    audit_id,
                    "admin",
                    format!("update_person:{}", args.id),
                    prev_json,
                    after_json,
                    args.reason,
                    now
                ],
            )?;

            Ok(())
        })
        .map_err(|e| e.to_string())
}

// ---------------- Loan Commands ----------------

#[tauri::command]
pub fn preview_loan(
    loan_amount: i64,
    interest_value: f64,
    is_percent: bool,
    day_amount: i64,
) -> Result<LoanPreview, String> {
    preview_loan_handover(loan_amount, interest_value, is_percent, day_amount)
}

#[tauri::command]
pub fn create_loan(state: State<'_, DbState>, args: CreateLoanArgs) -> Result<String, String> {
    let preview = preview_loan_handover(
        args.loan_amount,
        args.interest_value,
        args.is_percent,
        args.day_amount,
    )?;

    let now = Utc::now().to_rfc3339();
    let loan_id = Uuid::new_v4().to_string();
    let mode_str = if args.is_percent { "percent" } else { "rupee" };

    state
        .with_conn(|conn| {
            conn.execute(
                r#"
                INSERT INTO loans (
                    id, customer_id, guarantor_id, loan_amount, interest_amount, interest_input_mode,
                    day_amount, fine_per_missed_day, start_date, assigned_collector_id, status, created_at
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'active', ?11)
                "#,
                params![
                    loan_id,
                    args.customer_id,
                    args.guarantor_id,
                    args.loan_amount,
                    preview.interest_amount,
                    mode_str,
                    args.day_amount,
                    args.fine_per_missed_day,
                    args.start_date,
                    args.assigned_collector_id,
                    now
                ],
            )?;

            // Audit log
            let audit_id = Uuid::new_v4().to_string();
            conn.execute(
                r#"
                INSERT INTO audit_log (id, who, what_changed, before_val, after_val, reason, created_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                "#,
                params![
                    audit_id,
                    "admin",
                    format!("create_loan:{}", loan_id),
                    None::<String>,
                    format!("P={}, I={}, D={}, F={}", args.loan_amount, preview.interest_amount, args.day_amount, args.fine_per_missed_day),
                    "New loan creation",
                    now
                ],
            )?;

            Ok(())
        })
        .map_err(|e| e.to_string())?;

    Ok(loan_id)
}

fn load_loan_terms_and_data(
    conn: &rusqlite::Connection,
    loan_id: &str,
) -> Result<(LoanTerms, Vec<PaymentRecord>, Vec<WaiverRecord>), DbError> {
    let loan_terms = conn.query_row(
        r#"
        SELECT id, customer_id, loan_amount, interest_amount, interest_input_mode, day_amount, fine_per_missed_day, start_date
        FROM loans WHERE id = ?1
        "#,
        params![loan_id],
        |row| {
            let mode_str: String = row.get(4)?;
            let mode = if mode_str == "percent" {
                InterestInputMode::Percent
            } else {
                InterestInputMode::Rupee
            };
            let start_date_str: String = row.get(7)?;
            let start_date = NaiveDate::parse_from_str(&start_date_str, "%Y-%m-%d")
                .unwrap_or_else(|_| Local::now().date_naive());

            Ok(LoanTerms {
                id: row.get(0)?,
                customer_id: row.get(1)?,
                loan_amount: row.get(2)?,
                interest_amount: row.get(3)?,
                interest_input_mode: mode,
                day_amount: row.get(5)?,
                fine_per_missed_day: row.get(6)?,
                start_date,
            })
        },
    )?;

    let mut pay_stmt = conn.prepare(
        r#"
        SELECT id, loan_id, principal_amount, fine_amount, collected_at, status
        FROM payments WHERE loan_id = ?1
        "#,
    )?;
    let pay_rows = pay_stmt.query_map(params![loan_id], |row| {
        let date_str: String = row.get(4)?;
        let date = NaiveDate::parse_from_str(&date_str[..10], "%Y-%m-%d")
            .unwrap_or_else(|_| Local::now().date_naive());
        Ok(PaymentRecord {
            id: row.get(0)?,
            loan_id: row.get(1)?,
            principal_amount: row.get(2)?,
            fine_amount: row.get(3)?,
            collected_at: date,
            status: row.get(5)?,
        })
    })?;

    let mut payments = Vec::new();
    for p in pay_rows {
        payments.push(p?);
    }

    let mut waive_stmt = conn.prepare(
        r#"
        SELECT id, loan_id, amount, date, reason
        FROM fine_waivers WHERE loan_id = ?1
        "#,
    )?;
    let waive_rows = waive_stmt.query_map(params![loan_id], |row| {
        let date_str: String = row.get(3)?;
        let date = NaiveDate::parse_from_str(&date_str[..10], "%Y-%m-%d")
            .unwrap_or_else(|_| Local::now().date_naive());
        Ok(WaiverRecord {
            id: row.get(0)?,
            loan_id: row.get(1)?,
            amount: row.get(2)?,
            date,
            reason: row.get(4)?,
        })
    })?;

    let mut waivers = Vec::new();
    for w in waive_rows {
        waivers.push(w?);
    }

    Ok((loan_terms, payments, waivers))
}

#[tauri::command]
pub fn get_loans(state: State<'_, DbState>) -> Result<Vec<LoanItem>, String> {
    state
        .with_conn(|conn| {
            let mut stmt = conn.prepare(
                r#"
                SELECT l.id, l.customer_id, p.name, l.guarantor_id, g.name, l.loan_amount, l.interest_amount,
                       l.interest_input_mode, l.day_amount, l.fine_per_missed_day, l.start_date,
                       l.assigned_collector_id, c.username, l.status, l.created_at
                FROM loans l
                JOIN persons p ON l.customer_id = p.id
                LEFT JOIN persons g ON l.guarantor_id = g.id
                LEFT JOIN collectors c ON l.assigned_collector_id = c.id
                ORDER BY l.created_at DESC
                "#,
            )?;

            let rows = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, i64>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, i64>(8)?,
                    row.get::<_, i64>(9)?,
                    row.get::<_, String>(10)?,
                    row.get::<_, Option<String>>(11)?,
                    row.get::<_, Option<String>>(12)?,
                    row.get::<_, String>(13)?,
                    row.get::<_, String>(14)?,
                ))
            })?;

            let today = Local::now().date_naive();
            let mut loans = Vec::new();

            for r in rows {
                let (
                    id,
                    customer_id,
                    customer_name,
                    guarantor_id,
                    guarantor_name,
                    loan_amount,
                    interest_amount,
                    interest_input_mode,
                    day_amount,
                    fine_per_missed_day,
                    start_date,
                    assigned_collector_id,
                    assigned_collector_name,
                    status,
                    created_at,
                ) = r?;

                let (terms, payments, waivers) = load_loan_terms_and_data(conn, &id)?;
                let loan_state = calculate_loan_state(&terms, &payments, &waivers, today);

                // Update settled status if newly settled
                let final_status = if loan_state.is_settled {
                    "settled".to_string()
                } else {
                    status
                };

                loans.push(LoanItem {
                    id,
                    customer_id,
                    customer_name,
                    guarantor_id,
                    guarantor_name,
                    loan_amount,
                    interest_amount,
                    interest_input_mode,
                    day_amount,
                    fine_per_missed_day,
                    start_date,
                    assigned_collector_id,
                    assigned_collector_name,
                    status: final_status,
                    created_at,
                    outstanding_principal: loan_state.outstanding_principal,
                    fine_due: loan_state.fine_due,
                    principal_due_today: loan_state.principal_due_today,
                    is_settled: loan_state.is_settled,
                });
            }

            Ok(loans)
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_loan_detail(state: State<'_, DbState>, loan_id: String) -> Result<LoanDetail, String> {
    state
        .with_conn(|conn| {
            let (terms, payments, waivers) = load_loan_terms_and_data(conn, &loan_id)?;
            let today = Local::now().date_naive();
            let loan_state = calculate_loan_state(&terms, &payments, &waivers, today);
            let lookahead = calculate_7day_lookahead(&terms, &payments, &waivers, today);

            // Fetch loan header
            let loan = conn.query_row(
                r#"
                SELECT l.id, l.customer_id, p.name, l.guarantor_id, g.name, l.loan_amount, l.interest_amount,
                       l.interest_input_mode, l.day_amount, l.fine_per_missed_day, l.start_date,
                       l.assigned_collector_id, c.username, l.status, l.created_at
                FROM loans l
                JOIN persons p ON l.customer_id = p.id
                LEFT JOIN persons g ON l.guarantor_id = g.id
                LEFT JOIN collectors c ON l.assigned_collector_id = c.id
                WHERE l.id = ?1
                "#,
                params![loan_id],
                |row| {
                    Ok(LoanItem {
                        id: row.get(0)?,
                        customer_id: row.get(1)?,
                        customer_name: row.get(2)?,
                        guarantor_id: row.get(3)?,
                        guarantor_name: row.get(4)?,
                        loan_amount: row.get(5)?,
                        interest_amount: row.get(6)?,
                        interest_input_mode: row.get(7)?,
                        day_amount: row.get(8)?,
                        fine_per_missed_day: row.get(9)?,
                        start_date: row.get(10)?,
                        assigned_collector_id: row.get(11)?,
                        assigned_collector_name: row.get(12)?,
                        status: row.get(13)?,
                        created_at: row.get(14)?,
                        outstanding_principal: loan_state.outstanding_principal,
                        fine_due: loan_state.fine_due,
                        principal_due_today: loan_state.principal_due_today,
                        is_settled: loan_state.is_settled,
                    })
                },
            )?;

            // Fetch payments
            let mut pay_stmt = conn.prepare(
                r#"
                SELECT id, loan_id, collected_at, received_at, principal_amount, fine_amount, mode, reference, collected_by, status, decided_at, reason
                FROM payments
                WHERE loan_id = ?1
                ORDER BY collected_at DESC
                "#,
            )?;
            let pay_rows = pay_stmt.query_map(params![loan_id], |row| {
                let collected_at: String = row.get(2)?;
                let received_at: String = row.get(3)?;

                let c_date = NaiveDate::parse_from_str(&collected_at[..10], "%Y-%m-%d").ok();
                let r_date = NaiveDate::parse_from_str(&received_at[..10], "%Y-%m-%d").ok();
                let is_delayed = match (c_date, r_date) {
                    (Some(c), Some(r)) => (r - c).num_days() > 1,
                    _ => false,
                };

                Ok(PaymentItem {
                    id: row.get(0)?,
                    loan_id: row.get(1)?,
                    collected_at,
                    received_at,
                    principal_amount: row.get(4)?,
                    fine_amount: row.get(5)?,
                    mode: row.get(6)?,
                    reference: row.get(7)?,
                    collected_by: row.get(8)?,
                    status: row.get(9)?,
                    decided_at: row.get(10)?,
                    reason: row.get(11)?,
                    is_delayed,
                })
            })?;

            let mut payments_list = Vec::new();
            for p in pay_rows {
                payments_list.push(p?);
            }

            // Fetch security items
            let mut sec_stmt = conn.prepare(
                r#"
                SELECT id, loan_id, item_type, description, number_or_weight, bank, kept_where, estimated_value, status, returned_at, created_at
                FROM security_items
                WHERE loan_id = ?1
                ORDER BY created_at ASC
                "#,
            )?;
            let sec_rows = sec_stmt.query_map(params![loan_id], |row| {
                Ok(SecurityItem {
                    id: row.get(0)?,
                    loan_id: row.get(1)?,
                    item_type: row.get(2)?,
                    description: row.get(3)?,
                    number_or_weight: row.get(4)?,
                    bank: row.get(5)?,
                    kept_where: row.get(6)?,
                    estimated_value: row.get(7)?,
                    status: row.get(8)?,
                    returned_at: row.get(9)?,
                    created_at: row.get(10)?,
                })
            })?;

            let mut security_items = Vec::new();
            for s in sec_rows {
                security_items.push(s?);
            }

            Ok(LoanDetail {
                loan,
                state: loan_state,
                lookahead,
                payments: payments_list,
                waivers,
                security_items,
            })
        })
        .map_err(|e| e.to_string())
}

// ---------------- Security Items ----------------

#[tauri::command]
pub fn create_security_item(
    state: State<'_, DbState>,
    args: CreateSecurityItemArgs,
) -> Result<String, String> {
    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();

    state
        .with_conn(|conn| {
            conn.execute(
                r#"
                INSERT INTO security_items (id, loan_id, item_type, description, number_or_weight, bank, kept_where, estimated_value, status, created_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'held', ?9)
                "#,
                params![
                    id,
                    args.loan_id,
                    args.item_type,
                    args.description,
                    args.number_or_weight,
                    args.bank,
                    args.kept_where,
                    args.estimated_value,
                    now
                ],
            )?;
            Ok(())
        })
        .map_err(|e| e.to_string())?;

    Ok(id)
}

#[tauri::command]
pub fn mark_security_item_returned(
    state: State<'_, DbState>,
    item_id: String,
) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();

    state
        .with_conn(|conn| {
            conn.execute(
                "UPDATE security_items SET status = 'returned', returned_at = ?1 WHERE id = ?2",
                params![now, item_id],
            )?;
            Ok(())
        })
        .map_err(|e| e.to_string())
}

// ---------------- Collections and Verifications ----------------

#[tauri::command]
pub fn record_admin_payment(
    state: State<'_, DbState>,
    args: RecordAdminPaymentArgs,
) -> Result<String, String> {
    let payment_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    state
        .with_conn(|conn| {
            conn.execute(
                r#"
                INSERT INTO payments (
                    id, loan_id, collected_at, received_at, principal_amount, fine_amount,
                    mode, reference, collected_by, status, decided_at, reason
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'admin', 'verified', ?9, 'Admin direct entry')
                "#,
                params![
                    payment_id,
                    args.loan_id,
                    args.collected_at,
                    now,
                    args.principal_amount,
                    args.fine_amount,
                    args.mode,
                    args.reference,
                    now
                ],
            )?;

            // Check if loan is now fully settled
            let (terms, payments, waivers) = load_loan_terms_and_data(conn, &args.loan_id)?;
            let today = Local::now().date_naive();
            let loan_state = calculate_loan_state(&terms, &payments, &waivers, today);
            if loan_state.is_settled {
                conn.execute(
                    "UPDATE loans SET status = 'settled' WHERE id = ?1",
                    params![args.loan_id],
                )?;
            }

            Ok(())
        })
        .map_err(|e| e.to_string())?;

    Ok(payment_id)
}

#[tauri::command]
pub fn get_pending_verifications(state: State<'_, DbState>) -> Result<Vec<PaymentItem>, String> {
    state
        .with_conn(|conn| {
            let mut stmt = conn.prepare(
                r#"
                SELECT p.id, p.loan_id, p.collected_at, p.received_at, p.principal_amount, p.fine_amount,
                       p.mode, p.reference, p.collected_by, p.status, p.decided_at, p.reason
                FROM payments p
                WHERE p.status = 'collected'
                ORDER BY p.collected_at ASC
                "#,
            )?;

            let rows = stmt.query_map([], |row| {
                let collected_at: String = row.get(2)?;
                let received_at: String = row.get(3)?;

                let c_date = NaiveDate::parse_from_str(&collected_at[..10], "%Y-%m-%d").ok();
                let r_date = NaiveDate::parse_from_str(&received_at[..10], "%Y-%m-%d").ok();
                let is_delayed = match (c_date, r_date) {
                    (Some(c), Some(r)) => (r - c).num_days() > 1,
                    _ => false,
                };

                Ok(PaymentItem {
                    id: row.get(0)?,
                    loan_id: row.get(1)?,
                    collected_at,
                    received_at,
                    principal_amount: row.get(4)?,
                    fine_amount: row.get(5)?,
                    mode: row.get(6)?,
                    reference: row.get(7)?,
                    collected_by: row.get(8)?,
                    status: row.get(9)?,
                    decided_at: row.get(10)?,
                    reason: row.get(11)?,
                    is_delayed,
                })
            })?;

            let mut items = Vec::new();
            for item in rows {
                items.push(item?);
            }
            Ok(items)
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn verify_payment(state: State<'_, DbState>, payment_id: String) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();

    state
        .with_conn(|conn| {
            conn.execute(
                "UPDATE payments SET status = 'verified', decided_at = ?1 WHERE id = ?2",
                params![now, payment_id],
            )?;

            // Audit log
            let audit_id = Uuid::new_v4().to_string();
            conn.execute(
                r#"
                INSERT INTO audit_log (id, who, what_changed, before_val, after_val, reason, created_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                "#,
                params![
                    audit_id,
                    "admin",
                    format!("verify_payment:{}", payment_id),
                    "collected",
                    "verified",
                    "Admin verified collection",
                    now
                ],
            )?;

            // Check if loan is settled
            let loan_id: String = conn.query_row(
                "SELECT loan_id FROM payments WHERE id = ?1",
                params![payment_id],
                |row| row.get(0),
            )?;
            let (terms, payments, waivers) = load_loan_terms_and_data(conn, &loan_id)?;
            let today = Local::now().date_naive();
            let loan_state = calculate_loan_state(&terms, &payments, &waivers, today);
            if loan_state.is_settled {
                conn.execute(
                    "UPDATE loans SET status = 'settled' WHERE id = ?1",
                    params![loan_id],
                )?;
            }

            Ok(())
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reject_payment(state: State<'_, DbState>, args: RejectPaymentArgs) -> Result<(), String> {
    if args.reason.trim().is_empty() {
        return Err("A reason is required to reject a payment".into());
    }
    let now = Utc::now().to_rfc3339();

    state
        .with_conn(|conn| {
            conn.execute(
                "UPDATE payments SET status = 'rejected', decided_at = ?1, reason = ?2 WHERE id = ?3",
                params![now, args.reason, args.payment_id],
            )?;

            // Audit log
            let audit_id = Uuid::new_v4().to_string();
            conn.execute(
                r#"
                INSERT INTO audit_log (id, who, what_changed, before_val, after_val, reason, created_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                "#,
                params![
                    audit_id,
                    "admin",
                    format!("reject_payment:{}", args.payment_id),
                    "collected",
                    "rejected",
                    args.reason,
                    now
                ],
            )?;

            Ok(())
        })
        .map_err(|e| e.to_string())
}

// ---------------- Fine Waivers ----------------

#[tauri::command]
pub fn create_fine_waiver(
    state: State<'_, DbState>,
    args: CreateWaiverArgs,
) -> Result<String, String> {
    if args.amount <= 0 {
        return Err("Waiver amount must be greater than zero".into());
    }
    if args.reason.trim().is_empty() {
        return Err("A reason is required for a fine waiver".into());
    }

    let waiver_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    state
        .with_conn(|conn| {
            conn.execute(
                r#"
                INSERT INTO fine_waivers (id, loan_id, amount, reason, date, created_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                "#,
                params![
                    waiver_id,
                    args.loan_id,
                    args.amount,
                    args.reason,
                    args.date,
                    now
                ],
            )?;

            // Audit log
            let audit_id = Uuid::new_v4().to_string();
            conn.execute(
                r#"
                INSERT INTO audit_log (id, who, what_changed, before_val, after_val, reason, created_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                "#,
                params![
                    audit_id,
                    "admin",
                    format!("create_fine_waiver:{}", waiver_id),
                    None::<String>,
                    format!("loan={}, amount={}", args.loan_id, args.amount),
                    args.reason,
                    now
                ],
            )?;

            // Check if loan is now fully settled
            let (terms, payments, waivers) = load_loan_terms_and_data(conn, &args.loan_id)?;
            let today = Local::now().date_naive();
            let loan_state = calculate_loan_state(&terms, &payments, &waivers, today);
            if loan_state.is_settled {
                conn.execute(
                    "UPDATE loans SET status = 'settled' WHERE id = ?1",
                    params![args.loan_id],
                )?;
            }

            Ok(())
        })
        .map_err(|e| e.to_string())?;

    Ok(waiver_id)
}

// ---------------- Profit Reports ----------------

#[tauri::command]
pub fn get_profit_report(
    state: State<'_, DbState>,
    start_date: String,
    end_date: String,
) -> Result<ProfitReport, String> {
    state
        .with_conn(|conn| {
            // Interest profit: sum of interest on loans disbursed within range (start_date)
            let (interest_profit, loans_disbursed_count): (i64, i64) = conn.query_row(
                r#"
                SELECT COALESCE(SUM(interest_amount), 0), COUNT(*)
                FROM loans
                WHERE start_date >= ?1 AND start_date <= ?2
                "#,
                params![start_date, end_date],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )?;

            // Fine profit: sum of fine paid on verified payments collected within range
            let (fine_profit, principal_collected): (i64, i64) = conn.query_row(
                r#"
                SELECT COALESCE(SUM(fine_amount), 0), COALESCE(SUM(principal_amount), 0)
                FROM payments
                WHERE status = 'verified' AND substr(collected_at, 1, 10) >= ?1 AND substr(collected_at, 1, 10) <= ?2
                "#,
                params![start_date, end_date],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )?;

            Ok(ProfitReport {
                start_date: start_date.clone(),
                end_date: end_date.clone(),
                interest_profit,
                fine_profit,
                total_profit: interest_profit + fine_profit,
                loans_disbursed_count,
                principal_collected,
            })
        })
        .map_err(|e| e.to_string())
}

// ---------------- Collector Management ----------------

#[tauri::command]
pub fn create_collector(state: State<'_, DbState>, username: String) -> Result<String, String> {
    if username.trim().is_empty() {
        return Err("Username cannot be empty".into());
    }

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    state
        .with_conn(|conn| {
            conn.execute(
                "INSERT INTO collectors (id, username, active, created_at) VALUES (?1, ?2, 1, ?3)",
                params![id, username.trim(), now],
            )?;
            Ok(())
        })
        .map_err(|e| e.to_string())?;

    Ok(id)
}

#[tauri::command]
pub fn list_collectors(state: State<'_, DbState>) -> Result<Vec<CollectorAccount>, String> {
    state
        .with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, username, active, created_at FROM collectors ORDER BY username ASC",
            )?;
            let rows = stmt.query_map([], |row| {
                let active_int: i32 = row.get(2)?;
                Ok(CollectorAccount {
                    id: row.get(0)?,
                    username: row.get(1)?,
                    active: active_int == 1,
                    created_at: row.get(3)?,
                })
            })?;

            let mut collectors = Vec::new();
            for c in rows {
                collectors.push(c?);
            }
            Ok(collectors)
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_collector_status(
    state: State<'_, DbState>,
    collector_id: String,
    active: bool,
) -> Result<(), String> {
    state
        .with_conn(|conn| {
            let active_int = if active { 1 } else { 0 };
            conn.execute(
                "UPDATE collectors SET active = ?1 WHERE id = ?2",
                params![active_int, collector_id],
            )?;
            Ok(())
        })
        .map_err(|e| e.to_string())
}

// ---------------- Relay Synchronization ----------------

#[tauri::command]
pub async fn sync_with_relay(
    state: State<'_, DbState>,
    relay_url: Option<String>,
    admin_secret: Option<String>,
) -> Result<crate::relay_client::SyncResult, String> {
    let url = relay_url.unwrap_or_else(|| "http://localhost:3001".to_string());
    let secret = admin_secret.unwrap_or_else(|| "admin_relay_secret_2026".to_string());
    crate::relay_client::sync_relay(&state.conn, &url, &secret).await
}

// ---------------- Backup & Legacy Import ----------------

#[tauri::command]
pub fn export_encrypted_backup_command(
    state: State<'_, DbState>,
    destination_path: String,
) -> Result<crate::backup::BackupMetadata, String> {
    crate::backup::export_encrypted_backup(
        &state.db_path,
        &state.salt_path,
        std::path::Path::new(&destination_path),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn restore_encrypted_backup_command(
    state: State<'_, DbState>,
    backup_file_path: String,
) -> Result<(), String> {
    state.lock();
    crate::backup::restore_encrypted_backup(
        std::path::Path::new(&backup_file_path),
        &state.db_path,
        &state.salt_path,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_decrypted_json_command(state: State<'_, DbState>) -> Result<String, String> {
    state
        .with_conn(|conn| crate::backup::export_decrypted_json(conn))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_legacy_loans_command(
    state: State<'_, DbState>,
    csv_content: String,
) -> Result<crate::backup::ImportSummary, String> {
    state
        .with_conn_mut(|conn| crate::backup::import_legacy_loans_csv(conn, &csv_content).map_err(DbError::Crypto))
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_commands_workflow() {
        let temp_dir = std::env::temp_dir().join(format!("privolent_cmd_test_{}", Uuid::new_v4()));
        let db_path = temp_dir.join("cmd_test.db");
        let db_state = DbState::new(db_path.clone());
        db_state.unlock_or_initialize("adminKey123").unwrap();

        // 1. Create Person
        let person = db_state
            .with_conn(|conn| {
                let id = Uuid::new_v4().to_string();
                let now = Utc::now().to_rfc3339();
                conn.execute(
                    "INSERT INTO persons (id, name, aadhaar, address, phone, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![id, "Ramesh Kumar", "123456789012", "Shop 4, Market, Amritsar", "9876543210", now, now],
                )?;
                Ok(id)
            })
            .unwrap();

        // 2. Create Loan
        let loan_id = db_state
            .with_conn(|conn| {
                let lid = Uuid::new_v4().to_string();
                let now = Utc::now().to_rfc3339();
                conn.execute(
                    r#"
                    INSERT INTO loans (id, customer_id, loan_amount, interest_amount, interest_input_mode, day_amount, fine_per_missed_day, start_date, status, created_at)
                    VALUES (?1, ?2, 10000, 1000, 'percent', 100, 20, '2026-11-01', 'active', ?3)
                    "#,
                    params![lid, person, now],
                )?;
                Ok(lid)
            })
            .unwrap();

        // 3. Direct admin payment
        let pay_id = Uuid::new_v4().to_string();
        db_state
            .with_conn(|conn| {
                let now = Utc::now().to_rfc3339();
                conn.execute(
                    r#"
                    INSERT INTO payments (id, loan_id, collected_at, received_at, principal_amount, fine_amount, mode, collected_by, status, decided_at, reason)
                    VALUES (?1, ?2, '2026-11-01', ?3, 100, 0, 'cash', 'admin', 'verified', ?4, 'Admin test')
                    "#,
                    params![pay_id, loan_id, now, now],
                )?;
                Ok(())
            })
            .unwrap();

        // 4. Check Loan Details
        let (terms, payments, waivers) = db_state
            .with_conn(|conn| load_loan_terms_and_data(conn, &loan_id))
            .unwrap();
        assert_eq!(terms.loan_amount, 10000);
        assert_eq!(payments.len(), 1);
        assert_eq!(payments[0].principal_amount, 100);

        let day1 = NaiveDate::from_ymd_opt(2026, 11, 1).unwrap();
        let state = calculate_loan_state(&terms, &payments, &waivers, day1);
        assert_eq!(state.total_principal_repaid, 100);
        assert_eq!(state.outstanding_principal, 9900);

        // Cleanup
        db_state.lock();
        let _ = std::fs::remove_dir_all(temp_dir);
    }
}
