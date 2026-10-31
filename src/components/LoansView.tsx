import React, { useState } from "react";
import { Plus, Search, Calendar, User } from "lucide-react";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Badge } from "./ui/Badge";
import { Card, CardContent } from "./ui/Card";
import { LoanItem, Person, CollectorAccount } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

interface LoansViewProps {
  loans: LoanItem[];
  persons: Person[];
  collectors: CollectorAccount[];
  onOpenCreate: () => void;
  onSelectLoan: (loanId: string) => void;
}

export const LoansView: React.FC<LoansViewProps> = ({
  loans,
  onOpenCreate,
  onSelectLoan,
}) => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "settled">("active");

  const filtered = loans.filter((loan) => {
    const matchesSearch =
      loan.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      (loan.assigned_collector_name &&
        loan.assigned_collector_name.toLowerCase().includes(search.toLowerCase()));

    if (filter === "active") return matchesSearch && !loan.is_settled;
    if (filter === "settled") return matchesSearch && loan.is_settled;
    return matchesSearch;
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Loans Book</h2>
          <p className="text-xs text-slate-500">
            One model: Upfront interest deducted at handover, fixed daily collections, daily fines for missed days.
          </p>
        </div>
        <Button
          onClick={onOpenCreate}
          className="bg-teal-700 hover:bg-teal-800 text-white cursor-pointer"
        >
          <Plus className="size-4 mr-1.5" /> Disburse New Loan
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative max-w-md w-full">
          <Input
            placeholder="Search by customer name or assigned collector..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white"
          />
          <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
        </div>

        <div className="flex rounded-lg border border-slate-200 bg-white p-1 self-start sm:self-auto">
          <button
            onClick={() => setFilter("active")}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              filter === "active"
                ? "bg-teal-700 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Active ({loans.filter((l) => !l.is_settled).length})
          </button>
          <button
            onClick={() => setFilter("settled")}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              filter === "settled"
                ? "bg-teal-700 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Settled ({loans.filter((l) => l.is_settled).length})
          </button>
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              filter === "all"
                ? "bg-teal-700 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            All ({loans.length})
          </button>
        </div>
      </div>

      {/* Loans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((loan) => (
          <Card
            key={loan.id}
            onClick={() => onSelectLoan(loan.id)}
            className="hover:shadow-md transition-all cursor-pointer border-slate-200 hover:border-teal-500/50 flex flex-col justify-between"
          >
            <CardContent className="p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-base flex items-center gap-1.5">
                    {loan.customer_name}
                  </h4>
                  {loan.guarantor_name && (
                    <span className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                      <User className="size-3" /> Guar: {loan.guarantor_name}
                    </span>
                  )}
                </div>
                {loan.is_settled ? (
                  <Badge variant="success">Settled</Badge>
                ) : (
                  <Badge variant="default">Active</Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <div>
                  <div className="text-[10px] text-slate-500 font-medium">Loan (P)</div>
                  <div className="font-bold text-slate-800">{formatCurrency(loan.loan_amount)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-medium">Daily Slot (D)</div>
                  <div className="font-bold text-slate-800">{formatCurrency(loan.day_amount)}/day</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-medium">Outstanding Bal</div>
                  <div className="font-bold text-teal-700">
                    {formatCurrency(loan.outstanding_principal)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-medium">Fine Due</div>
                  <div className="font-bold text-amber-700">
                    {formatCurrency(loan.fine_due)}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
                <span className="flex items-center gap-1">
                  <Calendar className="size-3 text-slate-400" /> Start: {loan.start_date}
                </span>
                <span>
                  {loan.assigned_collector_name
                    ? `Col: ${loan.assigned_collector_name}`
                    : "Admin"}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full p-10 text-center bg-white rounded-xl border border-dashed border-slate-300">
            <p className="text-sm text-slate-500">No matching loans found.</p>
          </div>
        )}
      </div>
    </div>
  );
};
