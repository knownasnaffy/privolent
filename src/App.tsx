import { useState, useEffect } from "react";
import {
  BookOpen,
  Users,
  CheckSquare,
  TrendingUp,
  Smartphone,
  Lock,
  Plus,
  RefreshCw,
  Coins,
  Cloud,
} from "lucide-react";
import { api, DbStatus, LoanItem, Person, CollectorAccount, PaymentItem } from "@/lib/api";
import { UnlockScreen } from "@/components/UnlockScreen";
import { LoansView } from "@/components/LoansView";
import { CustomersView } from "@/components/CustomersView";
import { VerificationQueueView } from "@/components/VerificationQueueView";
import { ProfitReportView } from "@/components/ProfitReportView";
import { CollectorsView } from "@/components/CollectorsView";
import { LoanCreationModal } from "@/components/LoanCreationModal";
import { LoanDetailModal } from "@/components/LoanDetailModal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export function App() {
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const [activeTab, setActiveTab] = useState<
    "loans" | "customers" | "verifications" | "profit" | "collectors"
  >("loans");

  const [loans, setLoans] = useState<LoanItem[]>([]);
  const [persons, setPersons] = useState<Person[]>([]);
  const [collectors, setCollectors] = useState<CollectorAccount[]>([]);
  const [verifications, setVerifications] = useState<PaymentItem[]>([]);

  const [createLoanOpen, setCreateLoanOpen] = useState(false);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const checkStatus = async () => {
    try {
      const status = await api.getDbStatus();
      setDbStatus(status);
      if (status.is_unlocked) {
        await refreshAllData();
      }
    } catch (err) {
      console.error("Failed to get DB status", err);
    }
  };

  const refreshAllData = async () => {
    setLoading(true);
    try {
      const [l, p, c, v] = await Promise.all([
        api.getLoans(),
        api.getPersons(),
        api.listCollectors(),
        api.getPendingVerifications(),
      ]);
      setLoans(l);
      setPersons(p);
      setCollectors(c);
      setVerifications(v);
    } catch (err) {
      console.error("Failed to load records", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const [syncingRelay, setSyncingRelay] = useState(false);

  const handleSyncRelay = async () => {
    setSyncingRelay(true);
    try {
      const res = await api.syncWithRelay();
      alert(`Relay Sync Complete!\n• Pulled ${res.pulled_count} submissions from inbox\n• Acknowledged ${res.acknowledged_count} items\n• Published ${res.published_loans_count} active loans snapshot to outbox`);
      await refreshAllData();
    } catch (err: unknown) {
      alert(typeof err === "string" ? err : "Failed to sync with relay. Ensure relay server is running.");
    } finally {
      setSyncingRelay(false);
    }
  };

  const handleLock = async () => {
    try {
      await api.lockDatabase();
      setDbStatus({ is_initialized: true, is_unlocked: false });
    } catch (err) {
      console.error(err);
    }
  };

  // If DB status is still loading or locked:
  if (!dbStatus || !dbStatus.is_unlocked) {
    return (
      <UnlockScreen
        isInitialized={dbStatus?.is_initialized ?? false}
        onUnlocked={() => {
          checkStatus();
        }}
      />
    );
  }

  const activeLoansCount = loans.filter((l) => !l.is_settled).length;
  const pendingCount = verifications.length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-teal-700 flex items-center justify-center text-white shadow-xs">
              <Coins className="size-5" />
            </div>
            <div>
              <h1 className="font-bold text-base text-slate-900 leading-tight">
                Loan Collector
              </h1>
              <span className="text-[11px] text-teal-700 font-medium">
                Admin Desktop • Encrypted SQLCipher
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => setCreateLoanOpen(true)}
              className="bg-teal-700 hover:bg-teal-800 text-white cursor-pointer"
              size="sm"
            >
              <Plus className="size-4 mr-1" /> New Loan
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncRelay}
              disabled={syncingRelay}
              className="border-teal-200 text-teal-800 hover:bg-teal-50 cursor-pointer"
              title="Pull collector submissions from relay & publish outbox snapshot"
            >
              <Cloud className={`size-3.5 mr-1 ${syncingRelay ? "animate-spin" : ""}`} />
              {syncingRelay ? "Syncing..." : "Sync Relay"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshAllData}
              disabled={loading}
              title="Refresh local data"
              className="cursor-pointer"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLock}
              className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
              title="Lock database and clear key from memory"
            >
              <Lock className="size-3.5 mr-1" /> Lock
            </Button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 border-t border-slate-100 overflow-x-auto">
          <button
            onClick={() => setActiveTab("loans")}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "loans"
                ? "border-teal-700 text-teal-800"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
          >
            <BookOpen className="size-4" />
            <span>Loans</span>
            <Badge variant="secondary" className="ml-1 text-[10px] py-0 px-1.5">
              {activeLoansCount}
            </Badge>
          </button>

          <button
            onClick={() => setActiveTab("customers")}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "customers"
                ? "border-teal-700 text-teal-800"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
          >
            <Users className="size-4" />
            <span>Customers & Guarantors</span>
            <span className="text-[10px] text-slate-400 font-normal">({persons.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("verifications")}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "verifications"
                ? "border-teal-700 text-teal-800"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
          >
            <CheckSquare className="size-4" />
            <span>Verification Queue</span>
            {pendingCount > 0 && (
              <Badge variant="warning" className="ml-1 text-[10px] py-0 px-1.5 font-bold">
                {pendingCount}
              </Badge>
            )}
          </button>

          <button
            onClick={() => setActiveTab("profit")}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "profit"
                ? "border-teal-700 text-teal-800"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
          >
            <TrendingUp className="size-4" />
            <span>Profit Report</span>
          </button>

          <button
            onClick={() => setActiveTab("collectors")}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "collectors"
                ? "border-teal-700 text-teal-800"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
          >
            <Smartphone className="size-4" />
            <span>Collectors</span>
            <span className="text-[10px] text-slate-400 font-normal">({collectors.length})</span>
          </button>
        </div>
      </header>

      {/* Main Content View */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === "loans" && (
          <LoansView
            loans={loans}
            persons={persons}
            collectors={collectors}
            onOpenCreate={() => setCreateLoanOpen(true)}
            onSelectLoan={(id) => setSelectedLoanId(id)}
          />
        )}

        {activeTab === "customers" && (
          <CustomersView persons={persons} onRefresh={refreshAllData} />
        )}

        {activeTab === "verifications" && (
          <VerificationQueueView
            items={verifications}
            onRefresh={refreshAllData}
          />
        )}

        {activeTab === "profit" && <ProfitReportView />}

        {activeTab === "collectors" && (
          <CollectorsView
            collectors={collectors}
            onRefresh={refreshAllData}
          />
        )}
      </main>

      {/* Modals */}
      <LoanCreationModal
        open={createLoanOpen}
        onOpenChange={setCreateLoanOpen}
        persons={persons}
        collectors={collectors}
        onLoanCreated={refreshAllData}
      />

      <LoanDetailModal
        open={selectedLoanId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedLoanId(null);
        }}
        loanId={selectedLoanId}
        onRefresh={refreshAllData}
      />
    </div>
  );
}

export default App;
