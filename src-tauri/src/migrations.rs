use rusqlite_migration::{Migrations, M};

pub fn get_migrations() -> Migrations<'static> {
    Migrations::new(vec![
        M::up(
            r#"
            -- Persons table: customers and guarantors
            CREATE TABLE IF NOT EXISTS persons (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                aadhaar TEXT NOT NULL,
                address TEXT NOT NULL,
                phone TEXT NOT NULL,
                alternate_phone TEXT,
                occupation TEXT,
                photo TEXT,
                documents_collected TEXT,
                remarks TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_persons_name ON persons(name);
            CREATE INDEX IF NOT EXISTS idx_persons_phone ON persons(phone);

            -- Collectors table
            CREATE TABLE IF NOT EXISTS collectors (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );

            -- Loans table
            CREATE TABLE IF NOT EXISTS loans (
                id TEXT PRIMARY KEY,
                customer_id TEXT NOT NULL REFERENCES persons(id),
                guarantor_id TEXT REFERENCES persons(id),
                loan_amount INTEGER NOT NULL,
                interest_amount INTEGER NOT NULL,
                interest_input_mode TEXT NOT NULL, -- 'percent' or 'rupee'
                day_amount INTEGER NOT NULL,
                fine_per_missed_day INTEGER NOT NULL,
                start_date TEXT NOT NULL, -- YYYY-MM-DD
                assigned_collector_id TEXT REFERENCES collectors(id),
                status TEXT NOT NULL DEFAULT 'active', -- 'active', 'settled'
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_loans_customer ON loans(customer_id);
            CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);

            -- Payments table (UUID generated on device, idempotency key)
            CREATE TABLE IF NOT EXISTS payments (
                id TEXT PRIMARY KEY,
                loan_id TEXT NOT NULL REFERENCES loans(id),
                collected_at TEXT NOT NULL, -- YYYY-MM-DD or ISO timestamp
                received_at TEXT NOT NULL,
                principal_amount INTEGER NOT NULL,
                fine_amount INTEGER NOT NULL,
                mode TEXT NOT NULL, -- 'cash' or 'online'
                reference TEXT,
                collected_by TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'collected', -- 'collected', 'verified', 'rejected'
                decided_at TEXT,
                reason TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_payments_loan ON payments(loan_id);
            CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
            CREATE INDEX IF NOT EXISTS idx_payments_collected_at ON payments(collected_at);

            -- Fine Waivers table
            CREATE TABLE IF NOT EXISTS fine_waivers (
                id TEXT PRIMARY KEY,
                loan_id TEXT NOT NULL REFERENCES loans(id),
                amount INTEGER NOT NULL,
                reason TEXT NOT NULL,
                date TEXT NOT NULL, -- YYYY-MM-DD
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_fine_waivers_loan ON fine_waivers(loan_id);

            -- Security Items table
            CREATE TABLE IF NOT EXISTS security_items (
                id TEXT PRIMARY KEY,
                loan_id TEXT NOT NULL REFERENCES loans(id),
                item_type TEXT NOT NULL, -- 'cheque', 'gold', 'vehicle_rc', 'property', 'promissory_note', 'other'
                description TEXT NOT NULL,
                number_or_weight TEXT,
                bank TEXT,
                kept_where TEXT,
                estimated_value INTEGER,
                status TEXT NOT NULL DEFAULT 'held', -- 'held', 'returned'
                returned_at TEXT,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_security_items_loan ON security_items(loan_id);

            -- Audit Log table
            CREATE TABLE IF NOT EXISTS audit_log (
                id TEXT PRIMARY KEY,
                who TEXT NOT NULL,
                what_changed TEXT NOT NULL,
                before_val TEXT,
                after_val TEXT,
                reason TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);

            -- Processed Submissions table (to ignore duplicates from collector app)
            CREATE TABLE IF NOT EXISTS processed_submissions (
                submission_id TEXT PRIMARY KEY,
                received_time TEXT NOT NULL
            );

            -- App Settings (secrets, relay URL, relay credentials, shop metadata)
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            "#,
        ),
    ])
}
