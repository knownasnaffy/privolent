use chrono::{Days, NaiveDate};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum InterestInputMode {
    #[serde(rename = "percent")]
    Percent,
    #[serde(rename = "rupee")]
    Rupee,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoanTerms {
    pub id: String,
    pub customer_id: String,
    pub loan_amount: i64,          // P (whole rupees)
    pub interest_amount: i64,      // I (whole rupees)
    pub interest_input_mode: InterestInputMode,
    pub day_amount: i64,           // D (whole rupees)
    pub fine_per_missed_day: i64,  // F (whole rupees)
    pub start_date: NaiveDate,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentRecord {
    pub id: String,
    pub loan_id: String,
    pub principal_amount: i64,
    pub fine_amount: i64,
    pub collected_at: NaiveDate,
    pub status: String, // "verified", "collected", "rejected"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WaiverRecord {
    pub id: String,
    pub loan_id: String,
    pub amount: i64,
    pub date: NaiveDate,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LoanPreview {
    pub loan_amount: i64,
    pub interest_amount: i64,
    pub handover_amount: i64,
    pub day_amount: i64,
    pub full_slots: i64,
    pub remainder_amount: i64,
    pub has_remainder: bool,
    pub total_slots: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DayLookahead {
    pub date: NaiveDate,
    pub principal_due: i64,
    pub fine_due: i64,
    pub is_prepaid: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LoanState {
    pub loan_id: String,
    pub as_of_date: NaiveDate,
    pub total_principal_repaid: i64,
    pub outstanding_principal: i64,
    pub total_fine_earned: i64,
    pub total_fine_waived: i64,
    pub total_fine_paid: i64,
    pub fine_due: i64,
    pub missed_days_count: i64,
    pub prepaid_through_date: Option<NaiveDate>,
    pub principal_due_today: i64,
    pub is_settled: bool,
}

/// Calculate the handover and remainder preview for a loan before creation.
pub fn preview_loan_handover(
    loan_amount: i64,
    interest_value: f64,
    is_percent: bool,
    day_amount: i64,
) -> Result<LoanPreview, String> {
    if loan_amount <= 0 {
        return Err("Loan amount must be greater than zero".into());
    }
    if day_amount <= 0 {
        return Err("Day amount must be greater than zero".into());
    }

    let interest_amount = if is_percent {
        ((loan_amount as f64 * interest_value) / 100.0).round() as i64
    } else {
        interest_value.round() as i64
    };

    if interest_amount < 0 {
        return Err("Interest cannot be negative".into());
    }
    if interest_amount > loan_amount {
        return Err("Interest cannot exceed loan amount".into());
    }

    let handover_amount = loan_amount - interest_amount;
    let full_slots = loan_amount / day_amount;
    let remainder_amount = loan_amount % day_amount;
    let has_remainder = remainder_amount > 0;
    let total_slots = if has_remainder {
        full_slots + 1
    } else {
        full_slots
    };

    Ok(LoanPreview {
        loan_amount,
        interest_amount,
        handover_amount,
        day_amount,
        full_slots,
        remainder_amount,
        has_remainder,
        total_slots,
    })
}

/// Computes the pure loan state as of a specific date from stored verified payments and waivers.
pub fn calculate_loan_state(
    loan: &LoanTerms,
    payments: &[PaymentRecord],
    waivers: &[WaiverRecord],
    as_of_date: NaiveDate,
) -> LoanState {
    let verified_payments: Vec<&PaymentRecord> = payments
        .iter()
        .filter(|p| p.status == "verified" && p.collected_at <= as_of_date)
        .collect();

    let relevant_waivers: Vec<&WaiverRecord> = waivers
        .iter()
        .filter(|w| w.date <= as_of_date)
        .collect();

    let total_fine_waived: i64 = relevant_waivers.iter().map(|w| w.amount).sum();
    let total_fine_paid: i64 = verified_payments.iter().map(|p| p.fine_amount).sum();
    let total_principal_repaid: i64 = verified_payments.iter().map(|p| p.principal_amount).sum();
    let outstanding_principal = (loan.loan_amount - total_principal_repaid).max(0);

    // If as_of_date is before start_date, loan has not commenced yet.
    if as_of_date < loan.start_date {
        return LoanState {
            loan_id: loan.id.clone(),
            as_of_date,
            total_principal_repaid,
            outstanding_principal,
            total_fine_earned: 0,
            total_fine_waived,
            total_fine_paid,
            fine_due: 0,
            missed_days_count: 0,
            prepaid_through_date: None,
            principal_due_today: 0,
            is_settled: false,
        };
    }

    // Chronological day-by-day simulation from start_date to as_of_date
    // To correctly evaluate:
    // 1. Advance payments cover upcoming days (so prepayment prevents fines).
    // 2. A missed day earns fine F once.
    // 3. Late payment clears oldest unpaid days first, but does NOT erase fine already earned.
    // 4. After the last slot, every day with principal still outstanding and no payment is a missed day.

    let mut total_fine_earned = 0i64;
    let mut missed_days_count = 0i64;

    // We can group payments by date
    use std::collections::HashMap;
    let mut payments_by_date: HashMap<NaiveDate, i64> = HashMap::new();
    for p in &verified_payments {
        *payments_by_date.entry(p.collected_at).or_insert(0) += p.principal_amount;
    }

    // Cumulative principal paid up to each day
    // Prepaid slots available:
    // At any day `d`, let `slots_covered_by_start_of_day` be the number of slots covered
    // by payments prior to day `d`.
    let mut cumulative_principal_paid = 0i64;
    let mut current = loan.start_date;

    while current <= as_of_date {
        let principal_paid_today = payments_by_date.get(&current).copied().unwrap_or(0);
        let principal_before_today = cumulative_principal_paid;

        // Day index (1-based from start_date)
        let day_index = (current - loan.start_date).num_days() + 1;

        // Is loan already completely paid off before today?
        let was_already_settled_principal = principal_before_today >= loan.loan_amount;

        if !was_already_settled_principal {
            // Check if day was prepaid in advance:
            // A day is prepaid if cumulative principal before today covers up to day_index * day_amount
            let needed_to_cover_day = (day_index * loan.day_amount).min(loan.loan_amount);
            let is_prepaid_for_today = principal_before_today >= needed_to_cover_day;

            if is_prepaid_for_today {
                // Day was prepaid in advance, no fine earned, no missed day
            } else if principal_paid_today > 0 {
                // Payment was made on this day for principal, no fine earned for this day
            } else {
                // No payment today and not prepaid -> Missed day!
                total_fine_earned += loan.fine_per_missed_day;
                missed_days_count += 1;
            }
        }

        cumulative_principal_paid += principal_paid_today;
        current = current.checked_add_days(Days::new(1)).unwrap();
    }

    let net_fine_due = (total_fine_earned - total_fine_waived - total_fine_paid).max(0);

    // Calculate prepaid_through_date:
    // How many days from start_date does total_principal_repaid cover?
    let prepaid_through_date = if total_principal_repaid <= 0 {
        None
    } else {
        let full_days_covered = (total_principal_repaid / loan.day_amount).max(0);
        if full_days_covered > 0 {
            Some(
                loan.start_date
                    .checked_add_days(Days::new((full_days_covered - 1) as u64))
                    .unwrap(),
            )
        } else {
            None
        }
    };

    // Calculate principal_due_today:
    // If today is covered by prepaid_through_date, principal_due is 0.
    // Otherwise, it is the difference between expected cumulative principal for today and total repaid,
    // capped at outstanding_principal.
    let today_day_index = (as_of_date - loan.start_date).num_days() + 1;
    let expected_principal_today = (today_day_index * loan.day_amount).min(loan.loan_amount);
    let principal_due_today = if total_principal_repaid >= expected_principal_today {
        0
    } else {
        (expected_principal_today - total_principal_repaid).min(outstanding_principal)
    };

    let is_settled = outstanding_principal == 0 && net_fine_due == 0;

    LoanState {
        loan_id: loan.id.clone(),
        as_of_date,
        total_principal_repaid,
        outstanding_principal,
        total_fine_earned,
        total_fine_waived,
        total_fine_paid,
        fine_due: net_fine_due,
        missed_days_count,
        prepaid_through_date,
        principal_due_today,
        is_settled,
    }
}

/// Computes the 7-day lookahead table for a loan starting from as_of_date.
/// Assumes no further payments are made beyond those recorded up to as_of_date.
pub fn calculate_7day_lookahead(
    loan: &LoanTerms,
    payments: &[PaymentRecord],
    waivers: &[WaiverRecord],
    as_of_date: NaiveDate,
) -> Vec<DayLookahead> {
    let mut lookahead = Vec::with_capacity(7);

    for i in 0..7 {
        let target_date = as_of_date.checked_add_days(Days::new(i)).unwrap();
        let state = calculate_loan_state(loan, payments, waivers, target_date);

        let is_prepaid = match state.prepaid_through_date {
            Some(prepaid_date) => target_date <= prepaid_date,
            None => false,
        };

        lookahead.push(DayLookahead {
            date: target_date,
            principal_due: state.principal_due_today,
            fine_due: state.fine_due,
            is_prepaid,
        });
    }

    lookahead
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_loan() -> LoanTerms {
        LoanTerms {
            id: "loan-1".to_string(),
            customer_id: "cust-1".to_string(),
            loan_amount: 10_000,
            interest_amount: 1_000,
            interest_input_mode: InterestInputMode::Percent,
            day_amount: 100,
            fine_per_missed_day: 20,
            start_date: NaiveDate::from_ymd_opt(2026, 11, 1).unwrap(), // Day 1
        }
    }

    #[test]
    fn test_handover_preview_standard() {
        let preview = preview_loan_handover(10_000, 10.0, true, 100).unwrap();
        assert_eq!(preview.handover_amount, 9_000);
        assert_eq!(preview.interest_amount, 1_000);
        assert_eq!(preview.full_slots, 100);
        assert_eq!(preview.remainder_amount, 0);
        assert!(!preview.has_remainder);
        assert_eq!(preview.total_slots, 100);
    }

    #[test]
    fn test_handover_preview_with_remainder() {
        // From spec: P = 10,050 and D = 100 gives 100 slots of 100 plus final slot of 50
        let preview = preview_loan_handover(10_050, 1_000.0, false, 100).unwrap();
        assert_eq!(preview.loan_amount, 10_050);
        assert_eq!(preview.interest_amount, 1_000);
        assert_eq!(preview.handover_amount, 9_050);
        assert_eq!(preview.full_slots, 100);
        assert_eq!(preview.remainder_amount, 50);
        assert!(preview.has_remainder);
        assert_eq!(preview.total_slots, 101);
    }

    #[test]
    fn test_spec_worked_example() {
        // Spec Worked Example:
        // P = ₹10,000, interest 10% = ₹1,000, D = ₹100, F = ₹20.
        // Day 1-2: Pays ₹100 each day (Principal paid: ₹200, Fine earned: ₹0)
        // Day 3-4: No payment (Principal paid: ₹200, Fine earned: ₹40)
        // Day 5: Pays ₹300 (days 3, 4, 5) (Principal paid: ₹500, Fine earned on day 5: ₹0)
        // Day 5: Fine due ₹40; admin waives ₹20 and collects ₹20.
        // Result so far: interest profit ₹1,000, fine profit ₹20, principal repaid ₹500 of ₹10,000.

        let loan = create_test_loan();
        let day1 = NaiveDate::from_ymd_opt(2026, 11, 1).unwrap();
        let day2 = NaiveDate::from_ymd_opt(2026, 11, 2).unwrap();
        let day3 = NaiveDate::from_ymd_opt(2026, 11, 3).unwrap();
        let day4 = NaiveDate::from_ymd_opt(2026, 11, 4).unwrap();
        let day5 = NaiveDate::from_ymd_opt(2026, 11, 5).unwrap();

        let mut payments = vec![
            PaymentRecord {
                id: "pay-1".into(),
                loan_id: loan.id.clone(),
                principal_amount: 100,
                fine_amount: 0,
                collected_at: day1,
                status: "verified".into(),
            },
            PaymentRecord {
                id: "pay-2".into(),
                loan_id: loan.id.clone(),
                principal_amount: 100,
                fine_amount: 0,
                collected_at: day2,
                status: "verified".into(),
            },
        ];
        let mut waivers = vec![];

        // Day 2 state
        let state_d2 = calculate_loan_state(&loan, &payments, &waivers, day2);
        assert_eq!(state_d2.total_principal_repaid, 200);
        assert_eq!(state_d2.total_fine_earned, 0);
        assert_eq!(state_d2.fine_due, 0);
        assert_eq!(state_d2.missed_days_count, 0);
        assert_eq!(state_d2.principal_due_today, 0);

        // Day 3 (No payment)
        let state_d3 = calculate_loan_state(&loan, &payments, &waivers, day3);
        assert_eq!(state_d3.total_principal_repaid, 200);
        assert_eq!(state_d3.total_fine_earned, 20);
        assert_eq!(state_d3.fine_due, 20);
        assert_eq!(state_d3.missed_days_count, 1);
        assert_eq!(state_d3.principal_due_today, 100);

        // Day 4 (No payment)
        let state_d4 = calculate_loan_state(&loan, &payments, &waivers, day4);
        assert_eq!(state_d4.total_principal_repaid, 200);
        assert_eq!(state_d4.total_fine_earned, 40);
        assert_eq!(state_d4.fine_due, 40);
        assert_eq!(state_d4.missed_days_count, 2);
        assert_eq!(state_d4.principal_due_today, 200);

        // Day 5: Customer pays ₹300 principal and ₹20 fine. Admin waives ₹20 fine.
        payments.push(PaymentRecord {
            id: "pay-3".into(),
            loan_id: loan.id.clone(),
            principal_amount: 300,
            fine_amount: 20,
            collected_at: day5,
            status: "verified".into(),
        });
        waivers.push(WaiverRecord {
            id: "waive-1".into(),
            loan_id: loan.id.clone(),
            amount: 20,
            date: day5,
            reason: "Admin settlement waiver".into(),
        });

        let state_d5 = calculate_loan_state(&loan, &payments, &waivers, day5);
        assert_eq!(state_d5.total_principal_repaid, 500);
        assert_eq!(state_d5.outstanding_principal, 9_500);
        assert_eq!(state_d5.total_fine_earned, 40); // Earned from days 3 and 4
        assert_eq!(state_d5.total_fine_waived, 20);
        assert_eq!(state_d5.total_fine_paid, 20);
        assert_eq!(state_d5.fine_due, 0); // 40 - 20 - 20 = 0
        assert_eq!(state_d5.principal_due_today, 0); // Day 5 is fully covered
        assert!(!state_d5.is_settled);
    }

    #[test]
    fn test_advance_payment_prevents_fines() {
        // Customer prepays 3 days on day 1 (pays ₹300)
        let loan = create_test_loan();
        let day1 = NaiveDate::from_ymd_opt(2026, 11, 1).unwrap();
        let day2 = NaiveDate::from_ymd_opt(2026, 11, 2).unwrap();
        let day3 = NaiveDate::from_ymd_opt(2026, 11, 3).unwrap();
        let day4 = NaiveDate::from_ymd_opt(2026, 11, 4).unwrap();

        let payments = vec![PaymentRecord {
            id: "pay-adv".into(),
            loan_id: loan.id.clone(),
            principal_amount: 300, // Covers day 1, 2, 3
            fine_amount: 0,
            collected_at: day1,
            status: "verified".into(),
        }];

        // Day 2: Prepaid, no fine earned
        let state_d2 = calculate_loan_state(&loan, &payments, &[], day2);
        assert_eq!(state_d2.total_fine_earned, 0);
        assert_eq!(state_d2.fine_due, 0);
        assert_eq!(state_d2.principal_due_today, 0);
        assert_eq!(state_d2.prepaid_through_date, Some(day3));

        // Day 3: Still prepaid, no fine earned
        let state_d3 = calculate_loan_state(&loan, &payments, &[], day3);
        assert_eq!(state_d3.total_fine_earned, 0);
        assert_eq!(state_d3.fine_due, 0);
        assert_eq!(state_d3.principal_due_today, 0);

        // Day 4: Advance exhausted, missed day!
        let state_d4 = calculate_loan_state(&loan, &payments, &[], day4);
        assert_eq!(state_d4.total_fine_earned, 20);
        assert_eq!(state_d4.fine_due, 20);
        assert_eq!(state_d4.principal_due_today, 100);
    }

    #[test]
    fn test_rejected_payment_does_not_affect_balances() {
        let loan = create_test_loan();
        let day1 = NaiveDate::from_ymd_opt(2026, 11, 1).unwrap();

        let payments = vec![PaymentRecord {
            id: "pay-rej".into(),
            loan_id: loan.id.clone(),
            principal_amount: 100,
            fine_amount: 0,
            collected_at: day1,
            status: "rejected".into(), // Rejected by admin
        }];

        let state_d1 = calculate_loan_state(&loan, &payments, &[], day1);
        assert_eq!(state_d1.total_principal_repaid, 0);
        assert_eq!(state_d1.outstanding_principal, 10_000);
        assert_eq!(state_d1.total_fine_earned, 20); // Counted as missed
    }

    #[test]
    fn test_7day_lookahead() {
        let loan = create_test_loan();
        let day1 = NaiveDate::from_ymd_opt(2026, 11, 1).unwrap();

        // Customer paid day 1
        let payments = vec![PaymentRecord {
            id: "pay-1".into(),
            loan_id: loan.id.clone(),
            principal_amount: 100,
            fine_amount: 0,
            collected_at: day1,
            status: "verified".into(),
        }];

        let lookahead = calculate_7day_lookahead(&loan, &payments, &[], day1);
        assert_eq!(lookahead.len(), 7);

        // Day 1 (today): 0 principal due since paid, 0 fine due
        assert_eq!(lookahead[0].date, day1);
        assert_eq!(lookahead[0].principal_due, 0);
        assert_eq!(lookahead[0].fine_due, 0);

        // Day 2 (tomorrow, assuming no payment): 100 principal due, 20 fine due
        let day2 = NaiveDate::from_ymd_opt(2026, 11, 2).unwrap();
        assert_eq!(lookahead[1].date, day2);
        assert_eq!(lookahead[1].principal_due, 100);
        assert_eq!(lookahead[1].fine_due, 20);

        // Day 3: 200 principal due, 40 fine due
        assert_eq!(lookahead[2].principal_due, 200);
        assert_eq!(lookahead[2].fine_due, 40);
    }

    #[test]
    fn test_settlement_condition() {
        let loan = create_test_loan();
        let day1 = NaiveDate::from_ymd_opt(2026, 11, 1).unwrap();

        let payments = vec![PaymentRecord {
            id: "pay-full".into(),
            loan_id: loan.id.clone(),
            principal_amount: 10_000,
            fine_amount: 0,
            collected_at: day1,
            status: "verified".into(),
        }];

        let state = calculate_loan_state(&loan, &payments, &[], day1);
        assert_eq!(state.outstanding_principal, 0);
        assert_eq!(state.fine_due, 0);
        assert!(state.is_settled);
    }
}
