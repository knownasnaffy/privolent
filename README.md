# Loan Collector System (Privolent)

> **Secure, offline-first daily loan collection system** designed per **ADR-001** and **Product Spec v1**. Features an encrypted SQLite desktop application for the owner, a thin online relay server, and an offline-capable mobile PWA for field collectors.

---

## 🏛 Architecture Overview

The system consists of three decoupled components designed for maximum security, zero cloud lock-in, and reliable field operations even without cellular coverage:

```
┌──────────────────────────────────────────────┐
│        Desktop Admin Application (Tauri 2)   │
│  - Offline-first single writer               │
│  - SQLCipher Encrypted SQLite (Argon2id key) │
│  - Full Ledger, Audit Log, Handover Preview  │
│  - Verification Queue & Profit Reports       │
└──────────────┬───────────────────────────────┘
               │ Pull Submissions (Ack-then-Delete)
               │ Publish Snapshot (Privacy-Preserved)
               ▼
┌──────────────────────────────────────────────┐
│          Thin Online Relay Service           │
│  - Zero business logic, purely a mailbox     │
│  - Collector submissions inbox (Idempotent)  │
│  - Public outbox snapshot (Read-Only)        │
└──────────────▲───────────────────────────────┘
               │ Offline Queue Auto-Flush
               │ Read Snapshot Cards & Lookahead
┌──────────────┴───────────────────────────────┐
│              Collector Mobile PWA            │
│  - Phone-first responsive web app            │
│  - Offline submission queue (LocalStorage)   │
│  - 7-Day lookahead cards, masked phone nums  │
│  - Fast field collection form (< 30s entry)  │
└──────────────────────────────────────────────┘
```

### 1. Admin Desktop App (`src-tauri` + `src`)
- **Framework**: Tauri 2 (Rust backend) + React 19 + TypeScript + Tailwind CSS v4.
- **Storage**: SQLite encrypted with **SQLCipher** (AES-256-CBC) using 256-bit keys derived via **Argon2id** (`t_cost=3, m_cost=64MB, p=4`).
- **Passphrase Memory Safety**: Key is derived in-memory and held in a protected mutex; clearing memory immediately upon lock.
- **Pure Calculation Engine**: Zero ad-hoc financial math in queries; daily balances, 7-day lookaheads, missed-day fines, and prepayment schedules are computed deterministically.

### 2. Thin Online Relay (`relay/`)
- **Protocol**: HTTP REST pull-protocol.
- **Inbox**: Ingests field collections with UUID idempotency. Sets authoritative `received_at` timestamp.
- **Outbox**: Serves published customer cards and 7-day lookahead snapshots.
- **Data Pruning**: Ack-then-delete protocol with 30-day safety retention window.

### 3. Collector Mobile PWA (`collector-pwa/`)
- **Platform**: Lightweight responsive HTML5 / JavaScript PWA.
- **Offline First**: All payment submissions are queued locally and automatically synced when connectivity resumes.
- **Privacy Enforcement**: Customer phone numbers are masked (`•••• last4`), Aadhaar numbers and guarantors are omitted from the snapshot.

---

## 🧮 Loan Calculation Engine & Rules

All loan mechanics strictly adhere to the worked examples in the product specification:

1. **Upfront Interest Deduction**:
   $$\text{Handover Amount} = \text{Loan Principal} - \text{Interest Amount}$$
   For example: For a ₹10,000 loan with ₹1,000 upfront interest, the customer receives ₹9,000 cash in hand, but owes ₹10,000 in daily installments.
2. **Daily Installment & Remainder**:
   When daily amount does not evenly divide principal (e.g., ₹10,050 with ₹100/day = 100 days of ₹100 + 1 final day of ₹50), the system alerts the admin upfront and schedules the exact final remainder installment.
3. **Missed-Day Fines ($F = ₹20$/day)**:
   A fine is incurred for each calendar day a scheduled installment is missed.
4. **Prepayments & Advance Protection**:
   Paying more than the daily due pushes the `prepaid_through` date into the future. Customers are never fined for days that have been prepaid in advance.
5. **Separate Profit Reporting**:
   - **Interest Profit**: Earned upfront upon loan disbursal.
   - **Fine Profit**: Earned as cash/online payments when fine collections are verified.
   The two profit streams are tracked and reported separately.

---

## 🚀 Quick Start & Installation

### Prerequisites
- **Node.js** >= 18 and **pnpm**
- **Rust** >= 1.77 (`cargo`, `rustc`)
- System libraries: `build-essential`, `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev` (Linux only)

### Installation
```bash
# Clone the repository
git clone <repo-url>
cd autonomous_docs_project_build

# Install frontend and relay dependencies
pnpm install
```

---

## 🛠 Running the System

### 1. Run All Tests
Verify the complete test suite across Rust backend, Relay service, and Collector PWA:
```bash
pnpm test
```
Or run individual suites:
```bash
# Rust unit & integration tests (15 test suites)
cargo test --manifest-path src-tauri/Cargo.toml

# Relay HTTP integration tests
pnpm test:relay

# Mobile PWA integration tests
pnpm test:pwa
```

### 2. Run the Thin Online Relay Server
```bash
pnpm relay
# Server starts at http://localhost:3001
```

### 3. Open the Mobile Collector PWA
The relay server serves the Collector PWA statically at:
```
http://localhost:3001/collector/
```
Or open `collector-pwa/index.html` directly in any web browser.

### 4. Build and Run the Admin Desktop App
```bash
# Development mode with Hot Module Replacement
pnpm tauri dev

# Production build
pnpm build
pnpm tauri build
```

---

## 🔒 Security, Backup & Migration

### Encrypted Backups (`.encbak`)
In the desktop app under **Settings > Encrypted Backup**:
- **Export**: Exports a compressed `.encbak` archive combining the raw SQLCipher database file and the Argon2id salt. Without the owner's passphrase, the archive is mathematically unreadable.
- **Restore**: Restores any `.encbak` archive and prompts for the unlock passphrase.

### Decrypted JSON Dump
Under **Settings > Decrypted JSON Export**:
- Owners can export a human-readable JSON dump of all customers, active loans, and payment history for external bookkeeping or auditing.

### Legacy Excel / CSV Import
Under **Settings > Legacy CSV Import**:
Import legacy loans with existing opening balances directly via CSV:
```csv
customer_name,phone,aadhaar,address,loan_amount,interest_amount,day_amount,fine_per_day,start_date,principal_repaid,fine_paid
Satnam Singh,9876543210,123456789012,Street 5 Amritsar,10000,1000,100,20,2026-10-01,3000,100
Gurmeet Kaur,9812345678,987654321098,Village Chheharta,15000,1500,150,30,2026-10-15,1500,0
```
The importer automatically creates person records, loans, and initial verified opening-balance payments.

---

## 📁 Project Structure

```
├── collector-pwa/            # Mobile Collector Progressive Web App
│   ├── index.html            # Phone-optimized responsive layout
│   ├── app.js                # Offline queue, 7-day lookahead, sync
│   ├── manifest.json         # Web App Manifest
│   └── test.js               # PWA automated test suite
├── docs/                     # Specifications and architectural records
│   ├── ADR-001.md            # Binding Architecture Decision Record
│   ├── DEVIATIONS.md         # Documented deviations (none)
│   └── product-spec-v1.md    # Product Specification
├── relay/                    # Thin Online Relay Service
│   ├── server.js             # Pull protocol, inbox, outbox, static PWA host
│   └── test.js               # Integration test suite
├── src/                      # Admin Desktop UI (React 19 + TypeScript + Tailwind)
│   ├── components/           # UI Views (Loans, Verification, Customers, etc.)
│   ├── lib/                  # IPC bridge (`api.ts`) and calculation utilities
│   └── App.tsx               # Main Desktop Application Shell
├── src-tauri/                # Tauri 2 Desktop Backend (Rust)
│   ├── src/
│   │   ├── engine.rs         # Pure financial calculation engine
│   │   ├── crypto.rs         # Argon2id key derivation & CSPRNG salt
│   │   ├── db.rs             # SQLCipher connection manager & WAL
│   │   ├── migrations.rs     # Schema migrations (rusqlite_migration)
│   │   ├── commands.rs       # Tauri IPC commands
│   │   ├── relay_client.rs   # Sync client & privacy snapshot generator
│   │   └── backup.rs         # Encrypted zip backup & CSV legacy importer
│   └── Cargo.toml            # Rust dependencies & SQLCipher configuration
├── ASSUMPTIONS.md            # Logged design resolutions and domain assumptions
├── PLAN.md                   # Milestone execution plan
└── README.md                 # Complete system documentation
```

---

## ⚖ License
Proprietary & Confidential. Built for private loan collection operations.
