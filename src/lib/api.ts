import { invoke } from "@tauri-apps/api/core";

export interface DbStatus {
  is_initialized: boolean;
  is_unlocked: boolean;
}

export interface Person {
  id: string;
  name: string;
  aadhaar: string;
  address: string;
  phone: string;
  alternate_phone?: string | null;
  occupation?: string | null;
  photo?: string | null;
  documents_collected?: string | null;
  remarks?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePersonArgs {
  name: string;
  aadhaar: string;
  address: string;
  phone: string;
  alternate_phone?: string | null;
  occupation?: string | null;
  photo?: string | null;
  documents_collected?: string | null;
  remarks?: string | null;
}

export interface UpdatePersonArgs {
  id: string;
  name: string;
  aadhaar: string;
  address: string;
  phone: string;
  alternate_phone?: string | null;
  occupation?: string | null;
  photo?: string | null;
  documents_collected?: string | null;
  remarks?: string | null;
  reason: string;
}

export interface LoanItem {
  id: string;
  customer_id: string;
  customer_name: string;
  guarantor_id?: string | null;
  guarantor_name?: string | null;
  loan_amount: number;
  interest_amount: number;
  interest_input_mode: string;
  day_amount: number;
  fine_per_missed_day: number;
  start_date: string;
  assigned_collector_id?: string | null;
  assigned_collector_name?: string | null;
  status: string;
  created_at: string;
  outstanding_principal: number;
  fine_due: number;
  principal_due_today: number;
  is_settled: boolean;
}

export interface LoanPreview {
  loan_amount: number;
  interest_amount: number;
  handover_amount: number;
  day_amount: number;
  full_slots: number;
  remainder_amount: number;
  has_remainder: boolean;
  total_slots: number;
}

export interface CreateLoanArgs {
  customer_id: string;
  guarantor_id?: string | null;
  loan_amount: number;
  interest_value: number;
  is_percent: boolean;
  day_amount: number;
  fine_per_missed_day: number;
  start_date: string;
  assigned_collector_id?: string | null;
}

export interface DayLookahead {
  date: string;
  principal_due: number;
  fine_due: number;
  is_prepaid: boolean;
}

export interface PaymentItem {
  id: string;
  loan_id: string;
  collected_at: string;
  received_at: string;
  principal_amount: number;
  fine_amount: number;
  mode: string;
  reference?: string | null;
  collected_by: string;
  status: string;
  decided_at?: string | null;
  reason?: string | null;
  is_delayed: boolean;
}

export interface SecurityItem {
  id: string;
  loan_id: string;
  item_type: string;
  description: string;
  number_or_weight?: string | null;
  bank?: string | null;
  kept_where?: string | null;
  estimated_value?: number | null;
  status: string;
  returned_at?: string | null;
  created_at: string;
}

export interface CreateSecurityItemArgs {
  loan_id: string;
  item_type: string;
  description: string;
  number_or_weight?: string | null;
  bank?: string | null;
  kept_where?: string | null;
  estimated_value?: number | null;
}

export interface LoanDetail {
  loan: LoanItem;
  state: {
    loan_id: string;
    as_of_date: string;
    total_principal_repaid: number;
    outstanding_principal: number;
    total_fine_earned: number;
    total_fine_waived: number;
    total_fine_paid: number;
    fine_due: number;
    missed_days_count: number;
    prepaid_through_date?: string | null;
    principal_due_today: number;
    is_settled: boolean;
  };
  lookahead: DayLookahead[];
  payments: PaymentItem[];
  waivers: Array<{
    id: string;
    loan_id: string;
    amount: number;
    date: string;
    reason: string;
  }>;
  security_items: SecurityItem[];
}

export interface RecordAdminPaymentArgs {
  loan_id: string;
  principal_amount: number;
  fine_amount: number;
  mode: string;
  reference?: string | null;
  collected_at: string;
}

export interface ProfitReport {
  start_date: string;
  end_date: string;
  interest_profit: number;
  fine_profit: number;
  total_profit: number;
  loans_disbursed_count: number;
  principal_collected: number;
}

export interface CollectorAccount {
  id: string;
  username: string;
  active: boolean;
  created_at: string;
}

export interface SyncResult {
  pulled_count: number;
  acknowledged_count: number;
  published_loans_count: number;
  published_at: string;
}

export const api = {
  getDbStatus: () => invoke<DbStatus>("get_db_status"),
  unlockDatabase: (passphrase: string) =>
    invoke<void>("unlock_database", { passphrase }),
  lockDatabase: () => invoke<void>("lock_database"),

  // Persons
  getPersons: () => invoke<Person[]>("get_persons"),
  createPerson: (args: CreatePersonArgs) =>
    invoke<Person>("create_person", { args }),
  updatePerson: (args: UpdatePersonArgs) =>
    invoke<void>("update_person", { args }),

  // Loans
  previewLoan: (
    loanAmount: number,
    interestValue: number,
    isPercent: boolean,
    dayAmount: number
  ) =>
    invoke<LoanPreview>("preview_loan", {
      loanAmount,
      interestValue,
      isPercent,
      dayAmount,
    }),
  createLoan: (args: CreateLoanArgs) =>
    invoke<string>("create_loan", { args }),
  getLoans: () => invoke<LoanItem[]>("get_loans"),
  getLoanDetail: (loanId: string) =>
    invoke<LoanDetail>("get_loan_detail", { loanId }),

  // Security Items
  createSecurityItem: (args: CreateSecurityItemArgs) =>
    invoke<string>("create_security_item", { args }),
  markSecurityItemReturned: (itemId: string) =>
    invoke<void>("mark_security_item_returned", { itemId }),

  // Payments & Verifications
  recordAdminPayment: (args: RecordAdminPaymentArgs) =>
    invoke<string>("record_admin_payment", { args }),
  getPendingVerifications: () =>
    invoke<PaymentItem[]>("get_pending_verifications"),
  verifyPayment: (paymentId: string) =>
    invoke<void>("verify_payment", { paymentId }),
  rejectPayment: (paymentId: string, reason: string) =>
    invoke<void>("reject_payment", { args: { payment_id: paymentId, reason } }),

  // Waivers
  createFineWaiver: (loanId: string, amount: number, reason: string, date: string) =>
    invoke<string>("create_fine_waiver", {
      args: { loan_id: loanId, amount, reason, date },
    }),

  // Profit Report
  getProfitReport: (startDate: string, endDate: string) =>
    invoke<ProfitReport>("get_profit_report", {
      startDate,
      endDate,
    }),

  // Collectors
  listCollectors: () => invoke<CollectorAccount[]>("list_collectors"),
  createCollector: (username: string) =>
    invoke<string>("create_collector", { username }),
  toggleCollectorStatus: (collectorId: string, active: boolean) =>
    invoke<void>("toggle_collector_status", { collectorId, active }),

  // Relay Sync
  syncWithRelay: (relayUrl?: string, adminSecret?: string) =>
    invoke<SyncResult>("sync_with_relay", { relayUrl, adminSecret }),
};
