# Loan Collector — Architecture Decision Record (ADR-001)

Oct 31, 2026 · @Barinderpreet Singh

## Status and context

**Status:** Proposed. **Deciders:** the admin and the developer. **Supersedes:** the Next.js online app in Plan v2.

The loan model shrank to one simple rule set (see the product spec), and the app moved from an online web app to a desktop app that owns the data. The forces behind that move:

- One admin, about 40 active loans: scale is not a concern; correctness and safety of the data are.
- Collectors work in the field with unreliable signal and must never lose a collection.
- Customer records include Aadhaar numbers, so the less data sits in the cloud, the better.
- The admin wants the desktop copy to be the single source of truth, with nothing to reconcile against a cloud database.

## Decision

Build three parts, with the desktop app as the only long-term home of data.

1. **Admin desktop app (Tauri 2).** An offline-first app whose Rust backend owns an encrypted SQLite database. The frontend never touches SQL; it calls typed Rust commands.
2. **Collector PWA.** A phone-first, installable web app. It reads customer cards and amounts due from the relay, and writes collection submissions to it.
3. **Thin online relay.** A small API with two stores: an **inbox** of collector submissions and an **outbox** holding a read-only snapshot published by the desktop app.

Collector submissions travel PWA → inbox → desktop. The desktop saves them locally, confirms, and only then removes them from the inbox. The desktop is the single source of truth.

## System overview

&#91;embedded content: system overview · 3 parts, 4 flows\]

Collectors submit to the relay's inbox; the desktop pulls them, saves them locally, then deletes them from the inbox. The desktop publishes a read-only snapshot to the outbox, which the PWA reads.

## Options considered

| Option | Complexity | Offline for admin | Cloud holds customer data | Verdict |
| --- | --- | --- | --- | --- |
| A. Online Next.js app with a cloud database (Plan v2) | Low | No | Everything, including Aadhaar | Rejected: the admin wants the desktop copy as the source of truth |
| B. Tauri desktop app + PWA + thin relay (this decision) | Medium | Yes | Only the minimal snapshot and unprocessed submissions | **Chosen** |
| C. Tauri desktop app with full two-way database sync to the cloud | High | Yes | Everything | Rejected: conflict resolution is complex and a second source of truth reappears |

**Why B.** It keeps one writer for the books, so there are no merge conflicts. Collectors only ever add events, which makes the inbox a simple one-way mailbox.

## Data model

**Principle: store events, derive state.** Payments, waivers and loan terms are stored. Amount due, missed days, fine due, prepaid-through date, outstanding balance and "settled" are computed by one pure function from those records. Money is stored as whole rupees in integers, never floats.

| Table | Key fields |
| --- | --- |
| `persons` | id, name, Aadhaar (form to be decided), address, phone, optional alternate phone, occupation, photo, documents collected, remarks. Used for customers and guarantors alike |
| `loans` | id, customer, guarantor, loan amount, interest amount, interest input mode (% or ₹), day amount, fine per missed day, start date, assigned collector, status |
| `payments` | id (UUID, generated on the device that records it), loan, collected-at, received-at, principal amount, fine amount, mode (cash or online), reference, collected by, status (collected, verified, rejected), decided-at, reason |
| `fine_waivers` | id, loan, amount, reason, date |
| `security_items` | id, loan, type, description, number or weight, bank, kept where, value |
| `collectors` | id, username, active flag |
| `audit_log` | id, who, what changed, before, after, reason, time |
| `processed_submissions` | submission id, received time; used to ignore repeats |

A payment's UUID is the idempotency key: a retried submission with the same ID is recognised and ignored.

## Relay design

**Inbox (PWA → desktop).** Each submission carries its UUID, loan, principal paid, fine paid, mode, the device's collected-at time and the collector's identity. The server adds a received-at time. The desktop flags any submission whose two times differ by more than a day, because the collected date decides fines.

**Pull protocol (ack, then delete):**

1. The desktop fetches pending submissions.
2. It inserts each into the local database in one transaction, ignoring IDs already processed.
3. Only after that transaction commits does it tell the relay to delete those submissions.
4. A crash between steps 2 and 3 just causes a harmless re-fetch on the next pull.

The proposal is to keep acknowledged submissions on the relay for a short retention window (14 to 30 days) before purging, as a safety net until backups exist.

**Outbox (desktop → PWA).** The snapshot holds, per active loan: name, photo, locality, last 4 digits of the phone, assigned collector, and a **7-day lookahead** table of principal due and fine due for each upcoming day, assuming no further payments. The PWA reads today's row and does no fine arithmetic itself. Prepaid days show ₹0 principal due.

**Staleness.** The desktop publishes when the admin unlocks it and after every change. If the PWA's newest row is older than today, it shows a clear "stale since \<date>" banner and still lets the collector submit.

**Access.** Collector credentials can insert submissions and read the snapshot only. They cannot read other submissions or delete anything. The desktop holds a separate admin credential, stored inside the encrypted database.

## Security and data protection

- **Encryption at rest.** The SQLite database is encrypted with SQLCipher.
- **Passphrase, not a stored key.** The key is derived from the admin's passphrase with Argon2id and exists only in memory while the app is unlocked. No passphrase hash is stored; a wrong passphrase simply fails to open the database. The consequence: a lost passphrase means lost data, so it must be recorded safely.
- **Settings storage.** Non-secret preferences (shop name, UI options, sync cursor) may use the Tauri store plugin. Secrets such as the relay credential live inside the encrypted database.
- **Minimal cloud data.** Aadhaar numbers, totals and guarantor details never leave the desktop. The snapshot carries only what a collector needs to recognise a customer and collect.
- **Collector accounts.** Created on the desktop, provisioned to the relay, and deactivated instantly on request.
- **Audit.** Every admin edit, rejection and waiver is written to the audit log with a reason; collectors have no edit or delete anywhere.

## Rust backend

- **Database access.** `rusqlite` with bundled SQLCipher. The `tauri-plugin-sql` plugin is not used, because its SQLCipher support is awkward.
- **One connection.** A single connection sits behind a mutex in Tauri's managed state. Tauri can run several commands at once while SQLite allows one writer, so this avoids "database is locked" errors. Write-ahead logging (WAL) is turned on for crash-safe, faster writes; it is one pragma.
- **Commands.** The frontend calls typed Rust commands only, such as create loan, record collection, verify, reject, waive fine and publish snapshot.
- **Migrations.** Versioned from day one with `rusqlite_migration`, with a backup copy taken before each migration once backups exist.
- **Money engine.** The due and fine function lives in Rust, is pure, and is tested against the worked examples in the product spec.
- **Relay client.** Runs in the Rust side, pulls when the app is open and on a timer, and publishes the snapshot after unlock and after changes.

## Trade-offs and consequences

**What becomes easier**

- One writer and one source of truth: no merge conflicts or cloud reconciliation.
- Very little customer data in the cloud.
- The admin can work with no internet.

**What becomes harder, or is accepted**

- **The desktop is a single point of failure.** Until encrypted backups exist (P1 in the spec), a dead disk loses everything not in the relay's retention window. Backups should be built before real data is entered.
- **No phone access for the admin.** A read-only owner view from the snapshot is a future option.
- **Collector data lags.** Submissions enter the books only when the desktop app is open and online. The verification queue simply fills up.
- **Staleness.** Amounts on the collector's phone can be out of date if the admin was away; the 7-day lookahead and the stale banner limit the harm, and verify/reject catches duplicates.
- **Lost passphrase = lost data.**

**To revisit as the system grows**

- Backups: schedule, destination and restore drill.
- Retention window for acknowledged submissions.
- Whether an owner view or a second admin is ever needed, which would break the single-writer assumption.

## Action items and build order

- [ ] **Tauri 2 shell with encrypted SQLite.** SQLCipher via `rusqlite`, Argon2id passphrase, wrong-passphrase test, first migration, first commands. Done when the file is unreadable without the key and a round trip passes in `cargo test`.
- [ ] **First schema.** Persons, loans, payments, fine waivers, security items, audit log.
- [ ] **Due and fine engine** with tests from the spec's worked examples.
- [ ] **Admin screens.** Customers, loan creation with handover preview and remainder notice, direct collection, verification queue, waivers, profit report.
- [ ] **Relay.** Choose the host, build the inbox and outbox endpoints, collector accounts.
- [ ] **Snapshot publish and inbox pull** with ack-then-delete and idempotency.
- [ ] **Collector PWA.** Search cards, collect form (principal then fine), offline queue, last-refreshed label.
- [ ] **Encrypted backups and export**, then the one-time import of the \~40 Excel loans.

**Open decisions:** the relay host and provider; whether the Aadhaar field stores the full number or the last 4 plus a scan; the retention window for acknowledged submissions.
