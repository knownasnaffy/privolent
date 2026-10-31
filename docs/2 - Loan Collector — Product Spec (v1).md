# Loan Collector — Product Spec (v1)

Oct 31, 2026 · @Barinderpreet Singh

## Problem statement

Daily-collection loans are tracked in Excel today, and every collection is entered twice: once when the collector reports it, again when the cash reaches the admin. With about 40 active loans and fines that grow with each missed day, Excel can't reliably show what each customer owes today or which collector is holding cash that hasn't reached the admin.

The admin, a single person, feels this daily. Without a fix, fine and profit figures stay error-prone, and verification stays slow and manual.

## Goals

Targets below are proposals; adjust them with the admin.

1. **Correct money, always.** Amount due and fine due for any loan match a hand calculation on 100% of test cases.
2. **One entry, not two.** Each collection is recorded once by the collector and verified or rejected by the admin, with no re-typing.
3. **Same-day verification.** At least 95% of collected payments are verified or rejected on the day they are collected.
4. **Fast collection.** A collector records a payment in under 30 seconds, including when the phone has no signal.
5. **Profit clarity.** Interest profit and fine profit are reported separately for any date range.

## Non-goals

- **Other loan types.** Weekly or monthly loans, add-on interest, interest-only, part-upfront and reducing-balance interest are out. One simple model only.
- **Renewal and old-loan settlement at handover.** Not in v1; a decision, not an oversight.
- **Partial principal payments.** Customers pay whole day-amounts. The final remainder slot is the only exception.
- **Customer-facing access.** Customers and guarantors are records, never users.
- **Multi-admin or multi-device editing.** One desktop app is the single source of truth.
- **Encrypted backups in the first release.** Required soon after (see P1), but not a v1 blocker.

## Users and roles

| Role | Can do | Cannot do |
| --- | --- | --- |
| Admin (one person) | Everything: customers, guarantors, loans, security items, collections, verify/reject, fine waivers, collector accounts, reports | n/a |
| Collector | Search customer cards, see what to collect (principal and fine), record a collection | Edit, delete, verify, waive, or see totals and other collectors' data |

Customers and guarantors are records. They never log in.

## Loan rules

There is exactly one loan model: interest is deducted at handover, the customer repays the full loan amount in fixed daily amounts, and each missed day adds a fixed fine.

1. Admin sets the **loan amount** (P).
2. Admin sets **interest** (I) as a percentage of P or as a rupee amount. Either way it is stored as a rupee amount, plus which form was entered.
3. Admin sets the **day amount** (D) and the **fine per missed day** (F), both fixed per loan.
4. **Handover = P − I.** The customer repays **P**, not the handover amount.
5. The customer pays whole multiples of D. If P doesn't divide evenly by D, the last slot is the remainder, and the admin sees a notice at creation.
6. Days recur until principal is settled. There is no fixed end date.
7. A **missed day** is a day with no principal payment, unless that day is already prepaid. An advance payment covers upcoming days, so a customer who pays 3 × D on day 5 is not fined for days 6 and 7.
8. Each missed day adds F **once**. A late payment doesn't remove a fine already earned. After the last slot, every day with principal still outstanding and no payment is a missed day.
9. Payments clear the **oldest unpaid day first**. Fine is recorded separately as **fine profit**, apart from interest profit.
10. At settlement the admin may **waive** part of the fine due. A waiver is recorded with an amount, a reason and a date. A loan is settled when principal and remaining fine are both zero.

All amounts are whole rupees (INR). Due, missed days and outstanding balance are always computed from stored payments, never typed in.

**Worked example.** P = ₹10,000, interest 10% = ₹1,000, D = ₹100, F = ₹20. The customer receives ₹9,000 and has 100 daily slots.

| Day | Event | Principal paid | Fine earned |
| --- | --- | --- | --- |
| 1–2 | Pays ₹100 each day | ₹200 | ₹0 |
| 3–4 | No payment | ₹0 | ₹40 (2 × ₹20) |
| 5 | Pays ₹300 (days 3, 4, 5) | ₹300 | ₹0 |
| 5 | Fine due ₹40; admin waives ₹20 and collects ₹20 | n/a | ₹20 kept |

Result so far: interest profit ₹1,000 (fixed at creation), fine profit ₹20, principal repaid ₹500 of ₹10,000.

**Remainder example.** P = ₹10,050 and D = ₹100 gives 100 slots of ₹100 plus a final slot of ₹50. The creation screen warns about this before the loan is saved.

## User stories

**Admin**

- As the admin, I want to create a loan by entering amount, interest (% or ₹), day amount and fine, so that I see the handover amount before I give out any money.
- As the admin, I want a warning when the loan amount doesn't divide evenly by the day amount, so that I am never surprised by a remainder slot.
- As the admin, I want to verify or reject each collected payment, so that only money I have actually received counts as received.
- As the admin, I want to waive part of a customer's fine when settling it, so that I can use judgment while the books stay accurate.
- As the admin, I want interest profit and fine profit reported separately, so that I know where my income comes from.
- As the admin, I want to record guarantors and security items against a loan, so that everything I hold is tracked.

**Collector**

- As a collector, I want to search for the customer in front of me and see their principal and fine due, so that I ask for the right amount.
- As a collector, I want to enter principal paid and fine paid separately, so that fine profit is recorded correctly.
- As a collector, I want my submission to go through even when the signal drops, so that I never lose a collection.
- As a collector, I want to see when my data was last refreshed, so that I know if the amounts might be out of date.

**Edge cases**

- A customer prepays several days: the collector sees ₹0 principal due for the prepaid days.
- A collector submits twice because of a retry: only one payment is recorded.
- A customer pays only part of the fine: the rest stays due until collected or waived.

## Requirements

### Must-have (P0)

1. **Encrypted local database.** The desktop app stores everything in an encrypted SQLite file opened with a passphrase.
   - [ ] The wrong passphrase fails cleanly and shows no data.
   - [ ] The file cannot be read without the key.
2. **Customers and guarantors.** One record per person, reusable across loans. Required: name, Aadhaar, address, phone.
3. **Loan creation.** Fields per the loan rules, with a handover preview.
   - [ ] Given P = ₹10,050 and D = ₹100, when the admin previews, then a remainder-slot notice shows ₹50.
   - [ ] Given interest is entered as 10% of ₹10,000, then ₹1,000 is stored and handover shows ₹9,000.
4. **Due and fine engine.** One function computes principal due, missed days, fine due and outstanding from stored payments.
   - [ ] Matches the worked example in this document exactly.
   - [ ] Prepaid days produce no fine.
5. **Collections.** The admin records collections directly. Collectors submit through the PWA. Every collection stores principal and fine separately and has a unique ID.
6. **Verify or reject.** Only the admin can do either. Rejected payments stay visible and are excluded from balances.
7. **Fine waiver.** Recorded as its own entry with amount, reason and date.
8. **Profit report.** Interest profit and fine profit, by date range.
9. **Security items.** Type, description, number or weight, bank for cheques, where kept, value.
10. **Relay and collector PWA.** Collector data goes through the online relay. The desktop app pulls it, saves it, then removes it from the relay.
    - [ ] A retried submission never creates a second payment.
    - [ ] The PWA shows when its data was last refreshed.
11. **Audit trail.** Every admin edit, rejection and waiver is logged with a reason.

### Nice-to-have (P1)

- Encrypted backups to an external drive and cloud, plus a one-click export.
- One-time import of the \~40 loans currently in Excel, with opening balances.
- Launch at login and run in the tray, so the admin only has to unlock once a day.

### Future considerations (P2)

- Renewal and old-loan settlement at handover. Keep the handover as a list of lines so it can be added.
- Additional loan types.
- A read-only owner view on a phone, from the published snapshot.

## Success metrics

Targets are proposals; review them with the admin after the first month of real use.

| Metric | Type | Target | How measured |
| --- | --- | --- | --- |
| Engine matches hand calculation | Leading | 100% of test cases | Automated tests built from real loans |
| Collections verified or rejected same day | Leading | ≥ 95% | Collected-at vs decided-at in the database |
| Time for a collector to record a payment | Leading | < 30 seconds | Spot check with collectors |
| Duplicate payments created by retries | Leading | 0 | Count of repeated submission IDs |
| Rejected share of collected payments | Lagging | Falling month on month | Rejected ÷ collected |
| Fine waived vs fine earned | Lagging | Tracked, no target | Waiver entries ÷ fine earned |
| Admin time spent on daily reconciliation | Lagging | Clearly lower than with Excel | Admin's own estimate after one month |

## Open questions

**Blocking (answer before the schema is final)**

| # | Question | Owner |
| --- | --- | --- |
| 1 | Missed-day definition: this draft fines only days with no principal payment (and not prepaid). A customer who is 2 days behind but pays one day-amount every day is therefore not fined for those days. Is that intended? | Admin / uncle |
| 2 | After the last slot, does every day with principal outstanding count as a missed day (fine keeps growing)? This draft assumes yes. | Admin / uncle |
| 3 | Does the first due day fall on the disbursement day or the next day? Do Sundays and holidays have slots? | Admin / uncle |
| 4 | Is the per-loan assigned collector still in v1, or is any collector able to collect from anyone? | Admin / uncle |

**Non-blocking**

| # | Question | Owner |
| --- | --- | --- |
| 5 | Aadhaar: store the full number, or last 4 digits plus a scan? | Admin / uncle |
| 6 | Which fields appear on the collector's search card (name, photo, locality, masked phone)? The cards will sit in the cloud relay, so fewer is safer. | Admin / uncle |
| 7 | Rounding when a percentage gives paise: round to the nearest rupee? | Engineering |
| 8 | Security items: track return when a loan is settled? | Admin / uncle |
| 9 | Do the \~40 running loans need their history, or only opening balances? | Admin / uncle |

## Timeline and phasing

No hard deadline has been given. The phases below are ordered by dependency, and each one ends in something the admin can use.

1. **Foundation.** Desktop shell, encrypted database, customers, guarantors, loans, security items.
2. **Daily operations.** Due and fine engine, admin collections, verify or reject, fine waivers, profit report.
3. **Collectors.** Online relay, collector PWA, snapshot publishing, desktop pull.
4. **Safety and migration.** Encrypted backups, export, import of the \~40 Excel loans.

Phase 3 depends on phase 2, because the collector's screen shows amounts the engine produces. Backups are deliberately last in this list, but phase 4 should start before the app holds the only copy of real data.
