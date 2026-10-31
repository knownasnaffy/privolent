# Loan Collector — Assumptions Log

This document records the architectural and design decisions made to resolve open questions and ambiguities in `/docs`, adhering strictly to ADR-001 and Product Spec (v1).

## 1. Missed Day Definition & Fine Calculation
- **Rule**: Per spec section "Loan rules" (items 7-8), a missed day is a day with no principal payment, unless that day is prepaid. Fines are earned on missed days and once earned, late payments do not remove a fine already earned.
- **Decision**: Days are counted strictly starting from `start_date` up to the current calculation date (inclusive). A customer prepaying $k$ slots of day amount $D$ has their prepaid-through date advanced by $k$ days. Any day after `start_date` that is neither covered by prepayment nor has a principal payment made for that slot incurs a fixed fine $F$ once.
- **Calendar**: All calendar days count (daily loans run 7 days a week, no skipped holidays/Sundays).
- **Post-maturity**: After the final principal slot, if principal is still outstanding, every subsequent unpaid day accrues fine $F$ per day.

## 2. Handover Preview and Remainder Notice
- Loan amount $P$, Interest $I$ (% or ₹). Stored interest is in whole rupees (rounded to nearest whole rupee if percentage results in fractional rupees).
- Handover amount is $P - I$.
- Day amount $D$: Number of full slots = $\lfloor P / D \rfloor$. If $P \pmod D \neq 0$, the remainder slot amount is $P \pmod D$. Creation screen shows explicit notice/warning with remainder amount.

## 3. Storage and Encryption
- **SQLite with SQLCipher**: Encrypted via `rusqlite` with bundled SQLCipher (`sqlcipher-src`).
- **Key Derivation**: Argon2id derives the encryption key from the admin's passphrase with a stored salt.
- **Zero Hash**: No password hash is stored; if an incorrect passphrase is provided, SQLCipher fails to decrypt the database file, rejecting access cleanly.
- **Connection Management**: A single connection wrapped in `Arc<Mutex<Option<Connection>>>` managed by Tauri's state. WAL mode is enabled via `PRAGMA journal_mode = WAL;`.
- **Database Location**: Local app data directory (`$APP_DATA_DIR/loan_collector.db`).

## 4. Persons & Aadhaar
- `persons` table holds both customers and guarantors.
- Required fields: `name`, `aadhaar`, `address`, `phone`. Optional: `alternate_phone`, `occupation`, `photo`, `documents_collected`, `remarks`.
- Aadhaar is validated (10 to 12 chars / standard Indian identity format) and stored securely in the local encrypted database. Aadhaar is strictly excluded from cloud relay snapshots.

## 5. Security Items
- Tracked against loans: `type` (e.g. Cheque, Gold, RC/Vehicle Document, Property Papers, Promissory Note, Other), `description`, `number_or_weight`, `bank`, `kept_where`, `value`.
- Return tracking: Status (`held`, `returned`) and `returned_at` date recorded upon loan settlement.

## 6. Online Relay Architecture
- Architecture: A thin, lightweight relay service implemented in Node.js (or TypeScript) with fast, portable HTTP endpoints.
  - `POST /api/inbox`: Collector submits collections (UUID, loan_id, principal_paid, fine_paid, mode, collected_at, collector_id). Server timestamps `received_at`.
  - `GET /api/inbox/pending`: Admin pulls unacknowledged submissions.
  - `POST /api/inbox/ack`: Admin acknowledges processed submission IDs (which soft-deletes or archives them in the relay retention window).
  - `GET /api/outbox/snapshot`: Collector PWA fetches current read-only snapshot.
  - `POST /api/outbox/snapshot`: Admin pushes new snapshot.
  - `POST /api/collector/login`: Simple auth for collectors.
- In-memory / file-persisted relay backend that can run standalone, or be tested locally and hosted easily.

## 7. Collector PWA
- Responsive mobile-first interface designed for mobile collectors.
- Offline support: Stores submissions in localStorage / IndexedDB queue when offline, displaying an offline banner, and auto-syncing when online.
- Displays search cards with customer name, locality, photo placeholder, masked phone (last 4 digits), and 7-day lookahead for principal and fine due.
- Separate inputs for principal paid and fine paid, payment mode (Cash or Online), and submission timestamp.

## 8. Verification Queue & Audit Trail
- Desktop app maintains verification queue for collector submissions.
- Admin can `verify` or `reject` (with mandatory reason). Rejected payments do not count toward principal or fine totals.
- Every admin update, rejection, and fine waiver writes an audit log entry (`audit_log` table) recording `who`, `what_changed`, `before_val`, `after_val`, `reason`, and `timestamp`.

## 9. Profit Reporting
- Date range query calculating:
  - Interest profit: Sum of interest $I$ for loans disbursed within the date range.
  - Fine profit: Sum of verified fine payments collected within the date range.
- Clear separation between interest income and fine income.

## 10. Excel / Legacy Data Import (P1)
- CSV / JSON importer allowing admin to seed existing loans with initial balances (principal repaid to date, fine collected to date, start date).
