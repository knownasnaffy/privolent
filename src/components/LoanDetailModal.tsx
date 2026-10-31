import React, { useState, useEffect } from "react";
import {
  Calendar,
  DollarSign,
  ShieldAlert,
  PlusCircle,
  Clock,
  AlertCircle,
  BadgeCheck,
  Tag,
} from "lucide-react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Badge } from "./ui/Badge";
import { api, LoanDetail } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

interface LoanDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loanId: string | null;
  onRefresh: () => void;
}

export const LoanDetailModal: React.FC<LoanDetailModalProps> = ({
  open,
  onOpenChange,
  loanId,
  onRefresh,
}) => {
  const [detail, setDetail] = useState<LoanDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sub-modal states
  const [collectOpen, setCollectOpen] = useState(false);
  const [waiveOpen, setWaiveOpen] = useState(false);
  const [secItemOpen, setSecItemOpen] = useState(false);

  // Collection form state
  const [principalAmount, setPrincipalAmount] = useState<number>(0);
  const [fineAmount, setFineAmount] = useState<number>(0);
  const [payMode, setPayMode] = useState<string>("cash");
  const [payRef, setPayRef] = useState<string>("");
  const [payDate, setPayDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  // Waiver form state
  const [waiverAmount, setWaiverAmount] = useState<number>(0);
  const [waiverReason, setWaiverReason] = useState<string>("");
  const [waiverDate, setWaiverDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  // Security Item form state
  const [secType, setSecType] = useState<string>("cheque");
  const [secDesc, setSecDesc] = useState<string>("");
  const [secNumWeight, setSecNumWeight] = useState<string>("");
  const [secBank, setSecBank] = useState<string>("");
  const [secKeptWhere, setSecKeptWhere] = useState<string>("Shop Safe");
  const [secVal, setSecVal] = useState<number>(0);

  const loadData = async () => {
    if (!loanId) return;
    setLoading(true);
    try {
      const res = await api.getLoanDetail(loanId);
      setDetail(res);
      setPrincipalAmount(res.state.principal_due_today || res.loan.day_amount);
      setFineAmount(res.state.fine_due);
      setWaiverAmount(res.state.fine_due);
    } catch (err: unknown) {
      setError(typeof err === "string" ? err : "Failed to load loan details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && loanId) {
      loadData();
    } else {
      setDetail(null);
    }
  }, [open, loanId]);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanId) return;
    try {
      await api.recordAdminPayment({
        loan_id: loanId,
        principal_amount: principalAmount,
        fine_amount: fineAmount,
        mode: payMode,
        reference: payRef.trim() || null,
        collected_at: payDate,
      });
      setCollectOpen(false);
      await loadData();
      onRefresh();
    } catch (err: unknown) {
      alert(typeof err === "string" ? err : "Failed to record payment");
    }
  };

  const handleCreateWaiver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanId) return;
    if (!waiverReason.trim()) {
      alert("Please provide a reason for the waiver");
      return;
    }
    try {
      await api.createFineWaiver(loanId, waiverAmount, waiverReason, waiverDate);
      setWaiveOpen(false);
      setWaiverReason("");
      await loadData();
      onRefresh();
    } catch (err: unknown) {
      alert(typeof err === "string" ? err : "Failed to record fine waiver");
    }
  };

  const handleCreateSecurityItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanId || !secDesc.trim()) return;
    try {
      await api.createSecurityItem({
        loan_id: loanId,
        item_type: secType,
        description: secDesc.trim(),
        number_or_weight: secNumWeight.trim() || null,
        bank: secBank.trim() || null,
        kept_where: secKeptWhere.trim() || null,
        estimated_value: secVal || null,
      });
      setSecItemOpen(false);
      setSecDesc("");
      setSecNumWeight("");
      setSecBank("");
      await loadData();
    } catch (err: unknown) {
      alert(typeof err === "string" ? err : "Failed to add security item");
    }
  };

  const handleReturnSecurityItem = async (itemId: string) => {
    if (!confirm("Confirm marking this security item as returned to customer?")) return;
    try {
      await api.markSecurityItemReturned(itemId);
      await loadData();
    } catch (err: unknown) {
      alert(typeof err === "string" ? err : "Failed to update item status");
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <div className="flex items-center justify-between pr-6">
          <div className="flex items-center gap-2">
            <DialogTitle>{detail?.loan.customer_name || "Loan Detail"}</DialogTitle>
            {detail?.state.is_settled ? (
              <Badge variant="success">Settled</Badge>
            ) : (
              <Badge variant="default">Active</Badge>
            )}
          </div>
          <span className="text-xs text-slate-400 font-mono">ID: {loanId?.slice(0, 8)}</span>
        </div>
        <DialogDescription>
          {detail?.loan.guarantor_name && (
            <span>Guarantor: {detail.loan.guarantor_name} • </span>
          )}
          Disbursed on {detail?.loan.start_date} • Daily Amount: {formatCurrency(detail?.loan.day_amount)}
        </DialogDescription>
      </DialogHeader>

      {loading && !detail && (
        <div className="p-8 text-center text-sm text-slate-500">Loading loan records...</div>
      )}

      {error && (
        <div className="p-3 text-xs bg-red-50 text-red-700 rounded-lg">{error}</div>
      )}

      {detail && (
        <div className="flex flex-col gap-6 text-sm">
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] text-slate-500 font-medium">Outstanding Principal</div>
              <div className="text-lg font-bold text-slate-900 mt-0.5">
                {formatCurrency(detail.state.outstanding_principal)}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                Repaid: {formatCurrency(detail.state.total_principal_repaid)} / {formatCurrency(detail.loan.loan_amount)}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200">
              <div className="text-[11px] text-amber-800 font-medium">Fine Due</div>
              <div className="text-lg font-bold text-amber-900 mt-0.5">
                {formatCurrency(detail.state.fine_due)}
              </div>
              <div className="text-[10px] text-amber-700 mt-1">
                Earned: {formatCurrency(detail.state.total_fine_earned)} | Paid: {formatCurrency(detail.state.total_fine_paid)}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-teal-50/60 border border-teal-200">
              <div className="text-[11px] text-teal-800 font-medium">Due Today</div>
              <div className="text-lg font-bold text-teal-900 mt-0.5">
                {formatCurrency(detail.state.principal_due_today)}
              </div>
              <div className="text-[10px] text-teal-700 mt-1">
                {detail.state.prepaid_through_date
                  ? `Prepaid thru ${detail.state.prepaid_through_date}`
                  : `${detail.state.missed_days_count} missed days`}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] text-slate-500 font-medium">Handover Cash</div>
              <div className="text-lg font-bold text-slate-800 mt-0.5">
                {formatCurrency(detail.loan.loan_amount - detail.loan.interest_amount)}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                Profit (I): {formatCurrency(detail.loan.interest_amount)}
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-y border-slate-100 py-3">
            <Button
              onClick={() => setCollectOpen(true)}
              className="bg-teal-700 hover:bg-teal-800 text-white cursor-pointer"
              size="sm"
            >
              <DollarSign className="size-4 mr-1" /> Direct Collection
            </Button>
            <Button
              onClick={() => setWaiveOpen(true)}
              variant="outline"
              size="sm"
              className="border-amber-300 text-amber-900 hover:bg-amber-50 cursor-pointer"
            >
              <ShieldAlert className="size-4 mr-1 text-amber-600" /> Waive Fine
            </Button>
            <Button
              onClick={() => setSecItemOpen(true)}
              variant="outline"
              size="sm"
              className="cursor-pointer"
            >
              <PlusCircle className="size-4 mr-1 text-slate-600" /> Add Security Item
            </Button>
          </div>

          {/* 7-Day Lookahead Calendar */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="size-3.5 text-teal-700" /> 7-Day Lookahead (Assuming No Further Payments)
              </h4>
            </div>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3 font-semibold">Date</th>
                    <th className="py-2 px-3 font-semibold">Principal Due</th>
                    <th className="py-2 px-3 font-semibold">Fine Due</th>
                    <th className="py-2 px-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.lookahead.map((day, idx) => (
                    <tr key={day.date} className={idx === 0 ? "bg-teal-50/40 font-medium" : ""}>
                      <td className="py-2 px-3 flex items-center gap-1.5">
                        {day.date} {idx === 0 && <span className="text-[10px] text-teal-700 font-bold">(Today)</span>}
                      </td>
                      <td className="py-2 px-3">
                        {day.is_prepaid ? (
                          <Badge variant="success" className="text-[10px] py-0 px-1.5">
                            Prepaid ₹0
                          </Badge>
                        ) : (
                          formatCurrency(day.principal_due)
                        )}
                      </td>
                      <td className="py-2 px-3 text-amber-900 font-semibold">
                        {formatCurrency(day.fine_due)}
                      </td>
                      <td className="py-2 px-3 text-slate-500">
                        {day.is_prepaid ? "Covered by advance" : "Daily slot due"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Security Items Section */}
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Tag className="size-3.5 text-slate-600" /> Security Items Held ({detail.security_items.length})
            </h4>
            {detail.security_items.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {detail.security_items.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg border border-slate-200 bg-white flex flex-col justify-between gap-2 shadow-2xs"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800 capitalize">
                          {item.item_type}
                        </span>
                        {item.status === "held" ? (
                          <Badge variant="warning">Held in Safe</Badge>
                        ) : (
                          <Badge variant="success">Returned</Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-1">{item.description}</p>
                      {item.bank && <div className="text-[11px] text-slate-500">Bank: {item.bank}</div>}
                      {item.number_or_weight && (
                        <div className="text-[11px] text-slate-500">No / Wt: {item.number_or_weight}</div>
                      )}
                      {item.estimated_value && (
                        <div className="text-[11px] text-teal-800 font-medium">
                          Est. Value: {formatCurrency(item.estimated_value)}
                        </div>
                      )}
                    </div>
                    {item.status === "held" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReturnSecurityItem(item.id)}
                        className="text-xs py-1 h-7 cursor-pointer"
                      >
                        <BadgeCheck className="size-3.5 mr-1" /> Mark Returned
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No security items recorded for this loan.</p>
            )}
          </div>

          {/* Payment History */}
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="size-3.5 text-slate-600" /> Collections History ({detail.payments.length})
            </h4>
            <div className="border border-slate-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 sticky top-0">
                  <tr>
                    <th className="py-1.5 px-3">Date</th>
                    <th className="py-1.5 px-3">Principal</th>
                    <th className="py-1.5 px-3">Fine</th>
                    <th className="py-1.5 px-3">Mode</th>
                    <th className="py-1.5 px-3">Collector</th>
                    <th className="py-1.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="py-1.5 px-3 flex items-center gap-1">
                        {p.collected_at.slice(0, 10)}
                        {p.is_delayed && (
                          <span title="Late arrival: received > 1 day after collection">
                            <AlertCircle className="size-3 text-amber-500" />
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 font-semibold text-slate-900">
                        {formatCurrency(p.principal_amount)}
                      </td>
                      <td className="py-1.5 px-3 text-amber-800">
                        {formatCurrency(p.fine_amount)}
                      </td>
                      <td className="py-1.5 px-3 capitalize">{p.mode}</td>
                      <td className="py-1.5 px-3 text-slate-500">{p.collected_by}</td>
                      <td className="py-1.5 px-3">
                        {p.status === "verified" ? (
                          <span className="text-emerald-700 font-medium">Verified</span>
                        ) : p.status === "rejected" ? (
                          <span className="text-red-600 font-medium">Rejected ({p.reason})</span>
                        ) : (
                          <span className="text-amber-600 font-medium">Pending</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {detail.payments.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-slate-400">
                        No collections recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Record Direct Collection Sub-Dialog */}
      <Dialog open={collectOpen} onOpenChange={setCollectOpen}>
        <DialogHeader>
          <DialogTitle>Record Direct Collection</DialogTitle>
          <DialogDescription>
            Admin direct cash or online receipt. Recorded immediately as verified.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleRecordPayment} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-700">Principal Paid (₹) *</label>
              <Input
                type="number"
                min="0"
                step="10"
                value={principalAmount}
                onChange={(e) => setPrincipalAmount(Number(e.target.value))}
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-700">Fine Paid (₹)</label>
              <Input
                type="number"
                min="0"
                step="5"
                value={fineAmount}
                onChange={(e) => setFineAmount(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-700">Payment Mode</label>
              <select
                value={payMode}
                onChange={(e) => setPayMode(e.target.value)}
                className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-700"
              >
                <option value="cash">Cash</option>
                <option value="online">Online / UPI</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-700">Collection Date</label>
              <Input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-700">Reference / Notes</label>
            <Input
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              placeholder="e.g. UPI Ref / Cash receipt notes"
            />
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button type="button" variant="outline" onClick={() => setCollectOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-teal-700 hover:bg-teal-800 text-white">
              Save Collection
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Waive Fine Sub-Dialog */}
      <Dialog open={waiveOpen} onOpenChange={setWaiveOpen}>
        <DialogHeader>
          <DialogTitle>Waive Fine</DialogTitle>
          <DialogDescription>
            Waive all or part of the fine due. Written to audit log with a mandatory reason.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreateWaiver} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-700">Waiver Amount (₹) *</label>
              <Input
                type="number"
                min="1"
                value={waiverAmount}
                onChange={(e) => setWaiverAmount(Number(e.target.value))}
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-700">Date *</label>
              <Input
                type="date"
                value={waiverDate}
                onChange={(e) => setWaiverDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-700">Mandatory Reason *</label>
            <Input
              value={waiverReason}
              onChange={(e) => setWaiverReason(e.target.value)}
              placeholder="e.g. Settlement discount approved by admin"
              required
            />
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button type="button" variant="outline" onClick={() => setWaiveOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-amber-700 hover:bg-amber-800 text-white">
              Confirm Waiver
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Add Security Item Sub-Dialog */}
      <Dialog open={secItemOpen} onOpenChange={setSecItemOpen}>
        <DialogHeader>
          <DialogTitle>Add Security Item</DialogTitle>
          <DialogDescription>
            Record pledged securities (cheques, gold, vehicle papers, property documents).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreateSecurityItem} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-700">Item Type *</label>
              <select
                value={secType}
                onChange={(e) => setSecType(e.target.value)}
                className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-700"
              >
                <option value="cheque">Cheque</option>
                <option value="gold">Gold</option>
                <option value="vehicle_rc">Vehicle RC</option>
                <option value="property">Property Documents</option>
                <option value="promissory_note">Promissory Note</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-700">Est. Value (₹)</label>
              <Input
                type="number"
                min="0"
                value={secVal}
                onChange={(e) => setSecVal(Number(e.target.value))}
                placeholder="Optional estimated value"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-700">Description *</label>
            <Input
              value={secDesc}
              onChange={(e) => setSecDesc(e.target.value)}
              placeholder="e.g. Blank signed cheque / 10g Gold ring"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-700">Cheque No / Weight</label>
              <Input
                value={secNumWeight}
                onChange={(e) => setSecNumWeight(e.target.value)}
                placeholder="e.g. Chq #542132 or 15 grams"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-700">Bank (if Cheque)</label>
              <Input
                value={secBank}
                onChange={(e) => setSecBank(e.target.value)}
                placeholder="e.g. HDFC Bank, SBI"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-700">Kept Where</label>
            <Input
              value={secKeptWhere}
              onChange={(e) => setSecKeptWhere(e.target.value)}
              placeholder="e.g. Shop Safe, Locker 2"
            />
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button type="button" variant="outline" onClick={() => setSecItemOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-teal-700 hover:bg-teal-800 text-white">
              Save Security Item
            </Button>
          </div>
        </form>
      </Dialog>
    </Dialog>
  );
};
