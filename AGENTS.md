# AGENTS.md

This file gives AI coding agents the context they need to work on this codebase without having to reverse-engineer intent from the code alone.

## What this project is

Privolent is a self-hosted daily loan collection system for small informal lending operations. The owner uses a desktop application to manage loans, disburse cash, and review payments. Field collectors use a mobile PWA to record payments from customers throughout the day.

The defining constraint is trust and privacy: **no customer financial data lives in the cloud**. The relay server is deliberately dumb — it is a temporary mailbox and nothing more. All loan logic, calculations, and records live on the owner's machine inside an encrypted SQLite database.

## Three components, one flow

**Desktop app** (`src/` + `src-tauri/`) — Tauri 2, React 19, Rust backend. The single writer. Manages customers, loans, collectors, the verification queue, and profit reporting. All loan math happens here.

**Relay server** (`relay/`) — Node.js HTTP server. Has no business logic. Collectors `POST` payment submissions to its inbox; the desktop pulls and acknowledges them. The desktop also pushes a sanitised customer snapshot to the outbox so the PWA knows who to collect from.

**Collector PWA** (`collector-pwa/`) — Plain HTML/JS, no framework. Runs on the collector's phone. Reads the snapshot, shows customer cards with amounts due, and lets the collector submit payments. All submissions are queued locally and synced when online.

## Loan calculation rules

These are the core domain rules. They are implemented in `engine.rs` and tested with exact worked examples from the product spec. **Do not change the calculation logic without matching tests.**

- **Handover amount**: Customer receives `principal - interest`. Interest is deducted upfront.
- **Daily installment**: `principal / day_amount` slots. If principal is not divisible evenly, the last slot is the remainder (the creation UI warns about this).
- **Missed-day fines**: ₹20/day for each calendar day a due installment is missed. Fines are earned at end-of-day and do not get removed retroactively even if the customer later pays.
- **Prepayment protection**: Paying more than the daily due extends the `prepaid_through` date. Customers are never fined for days they've prepaid.
- **Profit tracking**: Interest profit and fine profit are separate. Interest is earned at disbursal; fine profit is earned when a fine payment is verified by the admin.

## Security model

- The database is encrypted with SQLCipher (AES-256-CBC). The encryption key is derived from the owner's passphrase using Argon2id (`t_cost=3, m_cost=64MB, p=4`).
- **No password hash is stored anywhere.** If you provide the wrong passphrase, SQLCipher simply fails to open the database.
- The key lives in memory in a `Mutex<Option<Connection>>`. It is cleared when the app is locked.
- The relay snapshot deliberately omits Aadhaar numbers, full phone numbers (shows last 4 only), and guarantor records.

## Key files

| File | Purpose |
|------|---------|
| `src-tauri/src/engine.rs` | Pure financial calculation engine — no I/O, no DB calls |
| `src-tauri/src/crypto.rs` | Argon2id key derivation and CSPRNG salt generation |
| `src-tauri/src/db.rs` | SQLCipher connection lifecycle and WAL setup |
| `src-tauri/src/migrations.rs` | Schema migrations via `rusqlite_migration` |
| `src-tauri/src/commands.rs` | All Tauri IPC command handlers |
| `src-tauri/src/relay_client.rs` | Pulls from relay inbox, publishes sanitised snapshot |
| `src-tauri/src/backup.rs` | `.encbak` backup/restore and legacy CSV import |
| `src/lib/api.ts` | Frontend IPC bridge (thin wrappers over `invoke`) |
| `relay/server.js` | The relay HTTP server |
| `collector-pwa/app.js` | PWA logic: offline queue, snapshot sync, UI |

## Spec and decisions

The `docs/` directory contains the binding architecture decision record (ADR-001) and product specification (v1). These are the ground truth for domain rules and architectural constraints. The `ASSUMPTIONS.md` in the root documents how ambiguities in those specs were resolved during implementation.

Do not introduce architectural changes that violate ADR-001 (for example: do not add business logic to the relay server, do not store sensitive data in the relay, do not remove the offline-first constraint from the PWA).

## Testing

Every component has its own test suite. Run them all with `pnpm test`. The Rust tests in particular cover the exact worked examples from the product spec — if you break those, you've broken the domain logic.

There is no mocking framework in the relay or PWA tests; they spin up real HTTP servers and test against them directly.
