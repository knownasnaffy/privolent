use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use uuid::Uuid;

use crate::db::DbError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupMetadata {
    pub timestamp: String,
    pub db_size_bytes: u64,
    pub salt_size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportSummary {
    pub imported_loans_count: usize,
    pub imported_persons_count: usize,
    pub opening_payments_count: usize,
}

/// Creates a self-contained encrypted backup archive (.encbak)
/// Contains the salt and encrypted SQLCipher database bytes.
/// Cannot be decrypted without the admin passphrase.
pub fn export_encrypted_backup(
    db_path: &Path,
    salt_path: &Path,
    destination: &Path,
) -> Result<BackupMetadata, DbError> {
    if !db_path.exists() || !salt_path.exists() {
        return Err(DbError::Crypto("Database or salt file does not exist".into()));
    }

    let salt_bytes = std::fs::read(salt_path)?;
    let db_bytes = std::fs::read(db_path)?;

    let mut dest_file = File::create(destination)?;

    // Write header: MAGIC "ENCBAK1" (7 bytes)
    dest_file.write_all(b"ENCBAK1")?;

    // Salt length (u32) + salt bytes
    dest_file.write_all(&(salt_bytes.len() as u32).to_le_bytes())?;
    dest_file.write_all(&salt_bytes)?;

    // DB length (u64) + DB bytes
    dest_file.write_all(&(db_bytes.len() as u64).to_le_bytes())?;
    dest_file.write_all(&db_bytes)?;

    Ok(BackupMetadata {
        timestamp: Utc::now().to_rfc3339(),
        db_size_bytes: db_bytes.len() as u64,
        salt_size_bytes: salt_bytes.len() as u64,
    })
}

/// Restores an encrypted backup archive (.encbak) into target db and salt paths
pub fn restore_encrypted_backup(
    backup_file: &Path,
    target_db: &Path,
    target_salt: &Path,
) -> Result<(), DbError> {
    let mut file = File::open(backup_file)?;

    // Check magic
    let mut magic = [0u8; 7];
    file.read_exact(&mut magic)?;
    if &magic != b"ENCBAK1" {
        return Err(DbError::Crypto("Invalid backup file format".into()));
    }

    // Read salt
    let mut salt_len_bytes = [0u8; 4];
    file.read_exact(&mut salt_len_bytes)?;
    let salt_len = u32::from_le_bytes(salt_len_bytes) as usize;
    let mut salt_bytes = vec![0u8; salt_len];
    file.read_exact(&mut salt_bytes)?;

    // Read DB
    let mut db_len_bytes = [0u8; 8];
    file.read_exact(&mut db_len_bytes)?;
    let db_len = u64::from_le_bytes(db_len_bytes) as usize;
    let mut db_bytes = vec![0u8; db_len];
    file.read_exact(&mut db_bytes)?;

    // Write out target files
    if let Some(parent) = target_db.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(target_salt, salt_bytes)?;
    std::fs::write(target_db, db_bytes)?;

    Ok(())
}

/// One-click decrypted JSON export for admin auditing or records
pub fn export_decrypted_json(conn: &Connection) -> Result<String, DbError> {
    // Persons
    let mut person_stmt = conn.prepare("SELECT id, name, aadhaar, address, phone, alternate_phone, occupation, remarks, created_at FROM persons")?;
    let persons: Vec<serde_json::Value> = person_stmt
        .query_map([], |r| {
            Ok(serde_json::json!({
                "id": r.get::<_, String>(0)?,
                "name": r.get::<_, String>(1)?,
                "aadhaar": r.get::<_, String>(2)?,
                "address": r.get::<_, String>(3)?,
                "phone": r.get::<_, String>(4)?,
                "alternate_phone": r.get::<_, Option<String>>(5)?,
                "occupation": r.get::<_, Option<String>>(6)?,
                "remarks": r.get::<_, Option<String>>(7)?,
                "created_at": r.get::<_, String>(8)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();

    // Loans
    let mut loan_stmt = conn.prepare("SELECT id, customer_id, loan_amount, interest_amount, interest_input_mode, day_amount, fine_per_missed_day, start_date, status, created_at FROM loans")?;
    let loans: Vec<serde_json::Value> = loan_stmt
        .query_map([], |r| {
            Ok(serde_json::json!({
                "id": r.get::<_, String>(0)?,
                "customer_id": r.get::<_, String>(1)?,
                "loan_amount": r.get::<_, i64>(2)?,
                "interest_amount": r.get::<_, i64>(3)?,
                "interest_input_mode": r.get::<_, String>(4)?,
                "day_amount": r.get::<_, i64>(5)?,
                "fine_per_missed_day": r.get::<_, i64>(6)?,
                "start_date": r.get::<_, String>(7)?,
                "status": r.get::<_, String>(8)?,
                "created_at": r.get::<_, String>(9)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();

    // Payments
    let mut pay_stmt = conn.prepare("SELECT id, loan_id, collected_at, principal_amount, fine_amount, mode, status, reason FROM payments")?;
    let payments: Vec<serde_json::Value> = pay_stmt
        .query_map([], |r| {
            Ok(serde_json::json!({
                "id": r.get::<_, String>(0)?,
                "loan_id": r.get::<_, String>(1)?,
                "collected_at": r.get::<_, String>(2)?,
                "principal_amount": r.get::<_, i64>(3)?,
                "fine_amount": r.get::<_, i64>(4)?,
                "mode": r.get::<_, String>(5)?,
                "status": r.get::<_, String>(6)?,
                "reason": r.get::<_, Option<String>>(7)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();

    let export = serde_json::json!({
        "exported_at": Utc::now().to_rfc3339(),
        "persons": persons,
        "loans": loans,
        "payments": payments,
    });

    Ok(serde_json::to_string_pretty(&export).unwrap_or_default())
}

/// One-time legacy import of running loans (from Excel/CSV) with opening balances.
/// Expected CSV header:
/// customer_name,phone,aadhaar,address,loan_amount,interest_amount,day_amount,fine_per_day,start_date,principal_repaid,fine_paid
pub fn import_legacy_loans_csv(
    conn: &mut Connection,
    csv_content: &str,
) -> Result<ImportSummary, String> {
    let now = Utc::now().to_rfc3339();
    let mut imported_loans_count = 0;
    let mut imported_persons_count = 0;
    let mut opening_payments_count = 0;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for (line_num, line) in csv_content.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() || line.to_lowercase().starts_with("customer_name") {
            continue; // Skip header or empty line
        }

        let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
        if parts.len() < 9 {
            return Err(format!(
                "Line {}: Invalid CSV format, expected at least 9 columns",
                line_num + 1
            ));
        }

        let customer_name = parts[0];
        let phone = parts[1];
        let aadhaar = parts[2];
        let address = parts[3];
        let loan_amount: i64 = parts[4]
            .parse()
            .map_err(|_| format!("Line {}: Invalid loan_amount", line_num + 1))?;
        let interest_amount: i64 = parts[5]
            .parse()
            .map_err(|_| format!("Line {}: Invalid interest_amount", line_num + 1))?;
        let day_amount: i64 = parts[6]
            .parse()
            .map_err(|_| format!("Line {}: Invalid day_amount", line_num + 1))?;
        let fine_per_day: i64 = parts[7]
            .parse()
            .map_err(|_| format!("Line {}: Invalid fine_per_day", line_num + 1))?;
        let start_date = parts[8];

        let principal_repaid: i64 = if parts.len() > 9 {
            parts[9].parse().unwrap_or(0)
        } else {
            0
        };
        let fine_paid: i64 = if parts.len() > 10 {
            parts[10].parse().unwrap_or(0)
        } else {
            0
        };

        // 1. Create or get Person
        let person_id = Uuid::new_v4().to_string();
        tx.execute(
            r#"
            INSERT INTO persons (id, name, aadhaar, address, phone, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            "#,
            params![person_id, customer_name, aadhaar, address, phone, now, now],
        )
        .map_err(|e| e.to_string())?;
        imported_persons_count += 1;

        // 2. Create Loan
        let loan_id = Uuid::new_v4().to_string();
        tx.execute(
            r#"
            INSERT INTO loans (
                id, customer_id, loan_amount, interest_amount, interest_input_mode,
                day_amount, fine_per_missed_day, start_date, status, created_at
            )
            VALUES (?1, ?2, ?3, ?4, 'rupee', ?5, ?6, ?7, 'active', ?8)
            "#,
            params![
                loan_id,
                person_id,
                loan_amount,
                interest_amount,
                day_amount,
                fine_per_day,
                start_date,
                now
            ],
        )
        .map_err(|e| e.to_string())?;
        imported_loans_count += 1;

        // 3. Opening balance payment if repaid > 0 or fine_paid > 0
        if principal_repaid > 0 || fine_paid > 0 {
            let pay_id = Uuid::new_v4().to_string();
            tx.execute(
                r#"
                INSERT INTO payments (
                    id, loan_id, collected_at, received_at, principal_amount, fine_amount,
                    mode, reference, collected_by, status, decided_at, reason
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'cash', 'Legacy Excel Opening Balance', 'admin', 'verified', ?7, 'Imported from Excel')
                "#,
                params![
                    pay_id,
                    loan_id,
                    start_date,
                    now,
                    principal_repaid,
                    fine_paid,
                    now
                ],
            )
            .map_err(|e| e.to_string())?;
            opening_payments_count += 1;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(ImportSummary {
        imported_loans_count,
        imported_persons_count,
        opening_payments_count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::DbState;

    #[test]
    fn test_backup_and_restore_roundtrip() {
        let temp_dir = std::env::temp_dir().join(format!("privolent_bak_test_{}", Uuid::new_v4()));
        let db_path = temp_dir.join("orig.db");
        let salt_path = temp_dir.join("orig.salt");
        let backup_path = temp_dir.join("archive.encbak");

        let db_state = DbState::new(db_path.clone());
        db_state.unlock_or_initialize("adminPass").unwrap();
        db_state.lock();

        // Export backup
        let meta = export_encrypted_backup(&db_path, &salt_path, &backup_path).unwrap();
        assert!(meta.db_size_bytes > 0);
        assert!(meta.salt_size_bytes > 0);
        assert!(backup_path.exists());

        // Restore to fresh target
        let target_db = temp_dir.join("restored.db");
        let target_salt = temp_dir.join("restored.salt");
        restore_encrypted_backup(&backup_path, &target_db, &target_salt).unwrap();

        // Verify restored DB can be opened with original passphrase
        let restored_state = DbState::new(target_db);
        assert!(restored_state.is_initialized());
        restored_state.unlock_or_initialize("adminPass").expect("Restored DB must unlock with passphrase");
        assert!(restored_state.is_unlocked());

        restored_state.lock();
        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn test_legacy_excel_loans_import() {
        let temp_dir = std::env::temp_dir().join(format!("privolent_imp_test_{}", Uuid::new_v4()));
        let db_path = temp_dir.join("import.db");
        let db_state = DbState::new(db_path);
        db_state.unlock_or_initialize("pass123").unwrap();

        let csv = r#"
customer_name,phone,aadhaar,address,loan_amount,interest_amount,day_amount,fine_per_day,start_date,principal_repaid,fine_paid
Satnam Singh,9876543210,123456789012,Street 5 Amritsar,10000,1000,100,20,2026-10-01,3000,100
Gurmeet Kaur,9812345678,987654321098,Village Chheharta,15000,1500,150,30,2026-10-15,1500,0
"#;

        db_state
            .with_conn_mut(|conn| {
                let summary = import_legacy_loans_csv(conn, csv).unwrap();
                assert_eq!(summary.imported_persons_count, 2);
                assert_eq!(summary.imported_loans_count, 2);
                assert_eq!(summary.opening_payments_count, 2);

                // Verify person and payments recorded
                let count: i64 = conn.query_row("SELECT count(*) FROM loans", [], |r| r.get(0))?;
                assert_eq!(count, 2);

                let total_opening_repaid: i64 = conn.query_row(
                    "SELECT sum(principal_amount) FROM payments WHERE status = 'verified'",
                    [],
                    |r| r.get(0),
                )?;
                assert_eq!(total_opening_repaid, 4500);

                Ok(())
            })
            .unwrap();

        db_state.lock();
        let _ = std::fs::remove_dir_all(temp_dir);
    }
}
