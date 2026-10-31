import React, { useState, useEffect } from "react";
import { TrendingUp, Coins, Calendar, Receipt, ArrowUpRight } from "lucide-react";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Card, CardContent } from "./ui/Card";
import { api, ProfitReport } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

export const ProfitReportView: React.FC = () => {
  const todayStr = new Date().toISOString().split("T")[0];
  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .split("T")[0];

  const [startDate, setStartDate] = useState(firstDayOfMonth);
  const [endDate, setEndDate] = useState(todayStr);
  const [report, setReport] = useState<ProfitReport | null>(null);

  const fetchReport = async () => {
    try {
      const res = await api.getProfitReport(startDate, endDate);
      setReport(res);
    } catch (err: unknown) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [startDate, endDate]);

  const setRangeThisMonth = () => {
    setStartDate(firstDayOfMonth);
    setEndDate(todayStr);
  };

  const setRangeLast30Days = () => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    setStartDate(d.toISOString().split("T")[0]);
    setEndDate(todayStr);
  };

  const setRangeAllTime = () => {
    setStartDate("2020-01-01");
    setEndDate("2099-12-31");
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Profit & Income Report</h2>
          <p className="text-xs text-slate-500">
            Clear separation between Upfront Interest Profit and Verified Fine Profit per Product Spec Goal 5.
          </p>
        </div>
      </div>

      {/* Date Filter Controls */}
      <Card className="p-4 bg-white border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-600">From:</span>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-36 h-8 text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-600">To:</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-36 h-8 text-xs"
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={setRangeThisMonth}
              className="text-xs h-8 cursor-pointer"
            >
              This Month
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={setRangeLast30Days}
              className="text-xs h-8 cursor-pointer"
            >
              Last 30 Days
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={setRangeAllTime}
              className="text-xs h-8 cursor-pointer"
            >
              All Time
            </Button>
          </div>
        </div>
      </Card>

      {/* Profit Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-teal-200 bg-teal-50/40">
          <CardContent className="p-5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-teal-800 uppercase tracking-wider">
                Interest Profit
              </span>
              <div className="size-8 rounded-lg bg-teal-600/10 flex items-center justify-center text-teal-700">
                <Coins className="size-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-teal-900">
              {formatCurrency(report?.interest_profit)}
            </div>
            <p className="text-[11px] text-teal-700">
              Earned upfront from {report?.loans_disbursed_count || 0} loans disbursed in date range
            </p>
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
                Fine Profit
              </span>
              <div className="size-8 rounded-lg bg-amber-600/10 flex items-center justify-center text-amber-700">
                <TrendingUp className="size-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-amber-900">
              {formatCurrency(report?.fine_profit)}
            </div>
            <p className="text-[11px] text-amber-700">
              From verified penalty collections on missed days
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900 text-white">
          <CardContent className="p-5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Total Net Profit
              </span>
              <div className="size-8 rounded-lg bg-white/10 flex items-center justify-center text-teal-300">
                <ArrowUpRight className="size-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-white">
              {formatCurrency(report?.total_profit)}
            </div>
            <p className="text-[11px] text-slate-400">
              Combined Interest Profit + Fine Profit
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Additional Volume Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500">Principal Repaid & Collected</span>
              <span className="text-xl font-bold text-slate-900">
                {formatCurrency(report?.principal_collected)}
              </span>
              <span className="text-[11px] text-slate-400">Verified cash returned to books</span>
            </div>
            <div className="size-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
              <Receipt className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500">Loans Disbursed in Period</span>
              <span className="text-xl font-bold text-slate-900">
                {report?.loans_disbursed_count || 0}
              </span>
              <span className="text-[11px] text-slate-400">Total new loan contracts issued</span>
            </div>
            <div className="size-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
              <Calendar className="size-5" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
