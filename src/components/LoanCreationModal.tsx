import React, { useState, useEffect, useMemo } from "react";
import { AlertTriangle, Calculator, CheckCircle2 } from "lucide-react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Badge } from "./ui/Badge";
import { Combobox } from "./ui/Combobox";
import { api, Person, CollectorAccount, LoanPreview } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

interface LoanCreationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  persons: Person[];
  collectors: CollectorAccount[];
  onLoanCreated: () => void;
}

export const LoanCreationModal: React.FC<LoanCreationModalProps> = ({
  open,
  onOpenChange,
  persons,
  collectors,
  onLoanCreated,
}) => {
  const [customerId, setCustomerId] = useState("");
  const [guarantorId, setGuarantorId] = useState("");
  const [loanAmount, setLoanAmount] = useState<number>(10000);
  const [interestValue, setInterestValue] = useState<number>(10);
  const [isPercent, setIsPercent] = useState<boolean>(true);
  const [dayAmount, setDayAmount] = useState<number>(100);
  const [finePerMissedDay, setFinePerMissedDay] = useState<number>(20);
  const [startDate, setStartDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [assignedCollectorId, setAssignedCollectorId] = useState<string>("");

  const customerOptions = useMemo(
    () =>
      persons.map((p) => ({
        value: p.id,
        label: `${p.name} (${p.phone})`,
        keywords: [p.name, p.phone],
      })),
    [persons]
  );

  const guarantorOptions = useMemo(
    () => [
      { value: "", label: "None" },
      ...persons
        .filter((p) => p.id !== customerId)
        .map((p) => ({
          value: p.id,
          label: `${p.name} (${p.phone})`,
          keywords: [p.name, p.phone],
        })),
    ],
    [persons, customerId]
  );

  const collectorOptions = useMemo(
    () => [
      { value: "", label: "Admin / Unassigned" },
      ...collectors
        .filter((c) => c.active)
        .map((c) => ({
          value: c.id,
          label: c.username,
        })),
    ],
    [collectors]
  );

  const handleCustomerChange = (id: string) => {
    setCustomerId(id);
    if (guarantorId === id) {
      setGuarantorId("");
    }
  };

  const [preview, setPreview] = useState<LoanPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Compute live preview whenever parameters change
  useEffect(() => {
    if (loanAmount > 0 && dayAmount > 0 && interestValue >= 0) {
      api
        .previewLoan(loanAmount, interestValue, isPercent, dayAmount)
        .then((res) => {
          setPreview(res);
          setError(null);
        })
        .catch((err) => {
          setPreview(null);
          setError(typeof err === "string" ? err : "Invalid loan inputs");
        });
    }
  }, [loanAmount, interestValue, isPercent, dayAmount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      setError("Please select a customer");
      return;
    }
    if (!preview) {
      setError("Please check loan calculations");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await api.createLoan({
        customer_id: customerId,
        guarantor_id: guarantorId || null,
        loan_amount: loanAmount,
        interest_value: interestValue,
        is_percent: isPercent,
        day_amount: dayAmount,
        fine_per_missed_day: finePerMissedDay,
        start_date: startDate,
        assigned_collector_id: assignedCollectorId || null,
      });
      onLoanCreated();
      onOpenChange(false);
    } catch (err: unknown) {
      setError(typeof err === "string" ? err : "Failed to create loan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Disburse New Loan</DialogTitle>
        <DialogDescription>
          Interest is deducted upfront at handover. Repaid in fixed daily amounts.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="p-3 text-xs rounded-lg bg-red-50 text-red-700 border border-red-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-700">Customer *</label>
            <Combobox
              options={customerOptions}
              value={customerId}
              onValueChange={handleCustomerChange}
              placeholder="Select customer..."
              searchPlaceholder="Search customer..."
              emptyText="No customer found."
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-700">Guarantor (Optional)</label>
            <Combobox
              options={guarantorOptions}
              value={guarantorId}
              onValueChange={setGuarantorId}
              placeholder="None"
              searchPlaceholder="Search guarantor..."
              emptyText="No guarantor found."
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-700">Loan Amount (P) *</label>
            <Input
              type="number"
              min="100"
              step="50"
              value={loanAmount}
              onChange={(e) => setLoanAmount(Number(e.target.value))}
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center">
              <label className="text-xs font-medium text-slate-700">Interest (I) *</label>
              <div className="inline-flex rounded-md border border-slate-300 p-0.5 bg-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPercent(true)}
                  className={`px-2 py-0.5 text-xs rounded font-medium cursor-pointer ${
                    isPercent ? "bg-white text-teal-800 shadow-xs" : "text-slate-600"
                  }`}
                >
                  %
                </button>
                <button
                  type="button"
                  onClick={() => setIsPercent(false)}
                  className={`px-2 py-0.5 text-xs rounded font-medium cursor-pointer ${
                    !isPercent ? "bg-white text-teal-800 shadow-xs" : "text-slate-600"
                  }`}
                >
                  ₹
                </button>
              </div>
            </div>
            <Input
              type="number"
              min="0"
              step={isPercent ? "0.1" : "50"}
              value={interestValue}
              onChange={(e) => setInterestValue(Number(e.target.value))}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-700">Daily Amount (D) *</label>
            <Input
              type="number"
              min="10"
              step="10"
              value={dayAmount}
              onChange={(e) => setDayAmount(Number(e.target.value))}
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-700">Fine per Missed Day (F) *</label>
            <Input
              type="number"
              min="0"
              step="5"
              value={finePerMissedDay}
              onChange={(e) => setFinePerMissedDay(Number(e.target.value))}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-700">Start Date *</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-700">Assign Collector</label>
            <Combobox
              options={collectorOptions}
              value={assignedCollectorId}
              onValueChange={setAssignedCollectorId}
              placeholder="Admin / Unassigned"
              searchPlaceholder="Search collector..."
              emptyText="No collector found."
            />
          </div>
        </div>

        {/* Live Calculation Preview Card */}
        {preview && (
          <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-teal-100 pb-2">
              <span className="text-xs font-semibold text-teal-900 flex items-center gap-1.5">
                <Calculator className="size-4 text-teal-700" /> Handover Preview
              </span>
              <Badge variant="outline" className="bg-white border-teal-200 text-teal-800">
                {preview.total_slots} Daily Slots
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-white rounded-lg p-2 border border-teal-100 shadow-xs">
                <div className="text-[10px] text-slate-500 font-medium">Loan Repaid (P)</div>
                <div className="text-sm font-bold text-slate-800">
                  {formatCurrency(preview.loan_amount)}
                </div>
              </div>
              <div className="bg-white rounded-lg p-2 border border-teal-100 shadow-xs">
                <div className="text-[10px] text-slate-500 font-medium">Interest Deducted (I)</div>
                <div className="text-sm font-bold text-teal-700">
                  {formatCurrency(preview.interest_amount)}
                </div>
              </div>
              <div className="bg-white rounded-lg p-2 border border-teal-200 shadow-xs ring-1 ring-teal-600/10">
                <div className="text-[10px] text-teal-900 font-semibold">Handover Cash</div>
                <div className="text-sm font-bold text-teal-800">
                  {formatCurrency(preview.handover_amount)}
                </div>
              </div>
            </div>

            {/* Remainder Warning Notice (ADR-001 & Spec Requirement) */}
            {preview.has_remainder ? (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                <AlertTriangle className="size-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <span className="font-semibold">Remainder Slot Notice:</span> {formatCurrency(preview.loan_amount)} does not divide evenly by {formatCurrency(preview.day_amount)}. The customer will pay {preview.full_slots} daily slots of {formatCurrency(preview.day_amount)} plus a final remainder slot of <span className="font-bold text-amber-800">{formatCurrency(preview.remainder_amount)}</span>.
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-teal-800 font-medium">
                <CheckCircle2 className="size-3.5 text-teal-600" />
                Divides evenly into {preview.full_slots} daily slots of {formatCurrency(preview.day_amount)}.
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={loading || !preview}
            className="bg-teal-700 hover:bg-teal-800 text-white"
          >
            {loading ? "Creating..." : "Confirm & Disburse Loan"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
};
