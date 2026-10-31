use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use rusqlite::Connection;
use thiserror::Error;

use crate::crypto::{self, SALT_LEN};
use crate::migrations;

#[derive(Debug, Error)]
pub enum DbError {
    #[error("Database is locked; please unlock with admin passphrase")]
    Locked,
    #[error("Invalid passphrase")]
    InvalidPassphrase,
    #[error("Database error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("Migration error: {0}")]
    Migration(#[from] rusqlite_migration::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Crypto error: {0}")]
    Crypto(String),
}

impl serde::Serialize for DbError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub struct DbState {
    pub conn: Arc<Mutex<Option<Connection>>>,
    pub db_path: PathBuf,
    pub salt_path: PathBuf,
}

impl DbState {
    pub fn new(db_path: PathBuf) -> Self {
        let mut salt_path = db_path.clone();
        salt_path.set_extension("salt");
        Self {
            conn: Arc::new(Mutex::new(None)),
            db_path,
            salt_path,
        }
    }

    /// Check if database file exists
    pub fn is_initialized(&self) -> bool {
        self.db_path.exists() && self.salt_path.exists()
    }

    /// Check if currently unlocked
    pub fn is_unlocked(&self) -> bool {
        let guard = self.conn.lock().unwrap();
        guard.is_some()
    }

    /// Lock database (clears connection and key from memory)
    pub fn lock(&self) {
        let mut guard = self.conn.lock().unwrap();
        *guard = None;
    }

    /// Unlock or initialize database with passphrase
    pub fn unlock_or_initialize(&self, passphrase: &str) -> Result<(), DbError> {
        let salt = if self.is_initialized() {
            let s = std::fs::read(&self.salt_path)?;
            if s.len() != SALT_LEN {
                return Err(DbError::Crypto("Corrupted salt file".into()));
            }
            let mut arr = [0u8; SALT_LEN];
            arr.copy_from_slice(&s);
            arr
        } else {
            // Generate and save new salt
            let s = crypto::generate_salt();
            if let Some(parent) = self.salt_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(&self.salt_path, s)?;
            s
        };

        let key = crypto::derive_key(passphrase, &salt).map_err(DbError::Crypto)?;
        let key_hex = crypto::to_hex(&key);

        let mut conn = Connection::open(&self.db_path)?;

        // Set SQLCipher encryption key
        let pragma_key = format!("PRAGMA key = \"x'{key_hex}'\";");
        if conn.execute_batch(&pragma_key).is_err() {
            return Err(DbError::InvalidPassphrase);
        }

        // Test decryption by reading sqlite_master
        let test_query = conn.query_row("SELECT count(*) FROM sqlite_master;", [], |_| Ok(()));
        if test_query.is_err() {
            return Err(DbError::InvalidPassphrase);
        }

        // Enable Write-Ahead Logging (WAL)
        if conn.pragma_update(None, "journal_mode", "WAL").is_err() {
            return Err(DbError::InvalidPassphrase);
        }

        // Run migrations to ensure up to date
        let migrations = migrations::get_migrations();
        migrations.to_latest(&mut conn)?;

        let mut guard = self.conn.lock().unwrap();
        *guard = Some(conn);

        Ok(())
    }

    /// Execute closure with active connection
    pub fn with_conn<F, R>(&self, f: F) -> Result<R, DbError>
    where
        F: FnOnce(&Connection) -> Result<R, DbError>,
    {
        let guard = self.conn.lock().unwrap();
        match guard.as_ref() {
            Some(conn) => f(conn),
            None => Err(DbError::Locked),
        }
    }

    /// Execute closure with mutable connection (e.g. for migrations/transactions)
    pub fn with_conn_mut<F, R>(&self, f: F) -> Result<R, DbError>
    where
        F: FnOnce(&mut Connection) -> Result<R, DbError>,
    {
        let mut guard = self.conn.lock().unwrap();
        match guard.as_mut() {
            Some(conn) => f(conn),
            None => Err(DbError::Locked),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_db_lifecycle_wrong_passphrase() {
        let temp_dir = std::env::temp_dir().join(format!("privolent_test_{}", uuid::Uuid::new_v4()));
        let db_path = temp_dir.join("test_loan_collector.db");
        let db_state = DbState::new(db_path.clone());

        assert!(!db_state.is_initialized());
        assert!(!db_state.is_unlocked());

        // Initialize with passphrase "adminPassphrase123"
        db_state.unlock_or_initialize("adminPassphrase123").expect("Initial unlock should succeed");
        assert!(db_state.is_initialized());
        assert!(db_state.is_unlocked());

        // Verify table exists
        db_state
            .with_conn(|conn| {
                let count: i64 = conn.query_row("SELECT count(*) FROM persons;", [], |row| row.get(0))?;
                assert_eq!(count, 0);
                Ok(())
            })
            .unwrap();

        // Lock DB
        db_state.lock();
        assert!(!db_state.is_unlocked());

        // Attempting to access while locked gives DbError::Locked
        let locked_err = db_state.with_conn(|_| Ok(()));
        assert!(matches!(locked_err, Err(DbError::Locked)));

        // Attempt unlock with WRONG passphrase
        let wrong_err = db_state.unlock_or_initialize("wrongPassphrase");
        assert!(matches!(wrong_err, Err(DbError::InvalidPassphrase)));
        assert!(!db_state.is_unlocked());

        // Unlock with CORRECT passphrase
        db_state.unlock_or_initialize("adminPassphrase123").expect("Correct passphrase should succeed");
        assert!(db_state.is_unlocked());

        // Cleanup
        db_state.lock();
        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn test_raw_db_file_is_encrypted() {
        let temp_dir = std::env::temp_dir().join(format!("privolent_test_enc_{}", uuid::Uuid::new_v4()));
        let db_path = temp_dir.join("test_encrypted.db");
        let db_state = DbState::new(db_path.clone());

        db_state.unlock_or_initialize("secretPassphrase!").unwrap();

        // Insert some sensitive data (e.g. an Aadhaar number)
        db_state
            .with_conn(|conn| {
                conn.execute(
                    "INSERT INTO persons (id, name, aadhaar, address, phone, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    rusqlite::params![
                        "p1",
                        "John Doe",
                        "987654321098", // Aadhaar
                        "123 Main St, City",
                        "9876543210",
                        "2026-11-01T00:00:00Z",
                        "2026-11-01T00:00:00Z"
                    ],
                )?;
                Ok(())
            })
            .unwrap();

        db_state.lock();

        // Read raw bytes of the db file
        let raw_bytes = std::fs::read(&db_path).unwrap();

        // Standard unencrypted SQLite databases start with the header string: "SQLite format 3\0"
        let standard_sqlite_header = b"SQLite format 3\0";
        assert_ne!(&raw_bytes[..16], standard_sqlite_header, "Database must NOT have plaintext SQLite header");

        // Plaintext Aadhaar string should NOT be found anywhere in the raw file bytes
        let search_target = b"987654321098";
        let found = raw_bytes.windows(search_target.len()).any(|w| w == search_target);
        assert!(!found, "Sensitive Aadhaar data must not be in plaintext in the database file!");

        // Cleanup
        let _ = std::fs::remove_dir_all(temp_dir);
    }
}
