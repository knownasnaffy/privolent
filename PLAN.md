# Implementation Plan: Loan Collector System

A secure, offline-first daily loan collection system with encrypted SQLite desktop app (Tauri 2), thin online relay, and mobile collector PWA, built per ADR-001 and Product Spec v1.

## Milestones

- [x] **Milestone 1: Core Calculation Engine & Worked Examples Test Suite**
  - [x] Implement `engine.rs` pure functions: principal due, missed days, fine earned, prepaid-through date, outstanding balance, settled flag.
  - [x] Implement 7-day lookahead generator for active loans.
  - [x] Implement unit test suite verifying the exact worked example in Product Spec v1 (Day 1-2 paid, Day 3-4 missed = ₹40 fine, Day 5 paid ₹300, ₹20 fine waived, ₹20 fine paid) and remainder calculation (₹10,050 with ₹100 daily = 100 slots + ₹50 remainder).
  - [x] Ensure `cargo test` passes 100%.

- [x] **Milestone 2: Encrypted Database & Schema Migrations**
  - [x] Implement Argon2id key derivation from admin passphrase (`crypto.rs`).
  - [x] Implement SQLCipher connection wrapper with WAL mode and passphrase authentication (`db.rs`).
  - [x] Add versioned schema migrations (`migrations.rs`) via `rusqlite_migration` for all tables: `persons`, `loans`, `payments`, `fine_waivers`, `security_items`, `collectors`, `audit_log`, `processed_submissions`, `app_settings`.
  - [x] Write tests confirming: wrong passphrase cleanly fails to open DB, correct passphrase succeeds, migrations execute, and raw database file cannot be read without key.
  - [x] Verify `cargo test` passes and commit.

- [x] **Milestone 3: Rust Tauri IPC Commands**
  - [x] Implement typed commands for database lifecycle (`unlock_database`, `lock_database`, `is_database_unlocked`, `initialize_database`).
  - [x] Implement person commands (`create_person`, `get_persons`, `search_persons`, `update_person`).
  - [x] Implement loan commands (`preview_loan`, `create_loan`, `get_loans`, `get_loan_detail` with live derived state).
  - [x] Implement security items commands (`create_security_item`, `get_security_items`, `mark_security_item_returned`).
  - [x] Implement direct admin collection (`record_admin_payment` with UUID idempotency).
  - [x] Implement verification queue commands (`get_pending_verifications`, `verify_payment`, `reject_payment` with mandatory reason & audit logging).
  - [x] Implement fine waiver command (`create_fine_waiver` with mandatory reason & audit logging).
  - [x] Implement profit report command (`get_profit_report` splitting interest profit and fine profit by date range).
  - [x] Implement collector management commands (`create_collector`, `list_collectors`, `toggle_collector_status`).
  - [x] Register all commands in `tauri::generate_handler!`.
  - [x] Write integration tests for command logic and state mutations.
  - [x] Verify `cargo test` passes and commit.

- [x] **Milestone 4: Admin Desktop Frontend (Tailwind + shadcn/ui)**
  - [x] Setup Tailwind CSS & shadcn components in Vite React app.
  - [x] Build Passphrase Unlock & Initial Setup screen.
  - [x] Build Application Shell with navigation: Dashboard, Loans, Customers, Verification Queue, Profit Report, Collectors, Settings.
  - [x] Build Loan Creation view with interactive Handover Preview and Remainder Notice banner.
  - [x] Build Customers & Guarantors directory with Aadhaar, phone, and linked loans.
  - [x] Build Loan Detail view with 7-day lookahead calendar, payment history, security items, direct collection modal, and fine waiver modal.
  - [x] Build Verification Queue with 1-click verify and reject dialogs (recording reasons).
  - [x] Build Profit Report screen with date range picker and interest vs fine profit metrics.
  - [x] Build Collector Accounts management UI.
  - [x] Verify `pnpm build` and frontend tests pass and commit.

- [x] **Milestone 5: Thin Online Relay Service**
  - [x] Implement lightweight online relay server (`relay/`):
    - `POST /api/inbox` for collector submissions (idempotent by payment UUID, server sets `received_at`).
    - `GET /api/inbox/pending` for admin to pull pending collections.
    - `POST /api/inbox/ack` to acknowledge and archive processed submissions.
    - `POST /api/outbox/snapshot` for admin to publish read-only customer cards and 7-day lookaheads.
    - `GET /api/outbox/snapshot` for collectors to fetch latest snapshot.
    - Collector authentication endpoint (`POST /api/collector/login`).
  - [x] Write automated tests for relay inbox, outbox, idempotency, and retention.
  - [x] Verify relay tests pass and commit.

- [x] **Milestone 6: Collector Mobile PWA**
  - [x] Build mobile-first PWA for collectors (`collector-pwa/`):
    - Collector login.
    - Customer search cards (photo, name, locality, masked phone, assigned collector filter).
    - Today's amount due card (principal due and fine due).
    - Fast collection form (< 30 seconds): principal paid, fine paid, mode (Cash/Online), offline-ready submit.
    - Offline queue with IndexedDB/localStorage and auto-sync when back online.
    - "Last refreshed" indicator and "Stale since <date>" banner if snapshot is out of date.
  - [x] Add tests for PWA offline queue and payload generation.
  - [x] Verify PWA build and tests pass and commit.

- [ ] **Milestone 7: Relay Sync Integration in Desktop App**
  - [ ] Implement Rust relay sync client in Tauri backend:
    - Pull pending submissions from relay inbox.
    - Insert submissions into SQLite in a single transaction (checking idempotency on UUID).
    - Confirm/ack with relay only after local transaction commits.
    - Flag submissions where `received_at - collected_at > 1 day`.
    - Automatically publish fresh snapshot to relay outbox upon unlock and after mutations.
  - [ ] Add manual sync button and sync status indicator in Admin UI.
  - [ ] Write integration test verifying the pull-ack-delete cycle and snapshot publishing.
  - [ ] Verify tests pass and commit.

- [ ] **Milestone 8: Safety, Export/Import, Documentation & Verification**
  - [ ] Implement encrypted database backup and export/import commands.
  - [ ] Implement Excel/CSV import for the ~40 legacy loans with opening balances.
  - [ ] Run full end-to-end verification across desktop app, relay, and collector PWA.
  - [ ] Update `README.md` with complete installation, build, testing, and running instructions.
  - [ ] Verify all tests, lints, and builds succeed from a clean state.
  - [ ] Final commit and summary.
