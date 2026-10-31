import React, { useState } from "react";
import { Check, X, AlertTriangle, Clock, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Badge } from "./ui/Badge";
import { Card, CardContent } from "./ui/Card";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/Dialog";
import { api, PaymentItem } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

interface VerificationQueueViewProps {
  items: PaymentItem[];
  onRefresh: () => void;
}

export const VerificationQueueView: React.FC<VerificationQueueViewProps> = ({
  items,
  onRefresh,
}) => {
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const handleVerify = async (paymentId: string) => {
    setLoading(true);
    try {
      await api.verifyPayment(paymentId);
      onRefresh();
    } catch (err: unknown) {
      alert(typeof err === "string" ? err : "Failed to verify payment");
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingId || !rejectReason.trim()) return;

    setLoading(true);
    try {
      await api.rejectPayment(rejectingId, rejectReason.trim());
      setRejectingId(null);
      setRejectReason("");
      onRefresh();
    } catch (err: unknown) {
      alert(typeof err === "string" ? err : "Failed to reject payment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            Verification Queue
            {items.length > 0 && (
              <Badge variant="warning">{items.length} Pending</Badge>
            )}
          </h2>
          <p className="text-xs text-slate-500">
            Collections recorded by field collectors. Verify only after physical cash or UPI settlement is received.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={onRefresh}
          className="cursor-pointer"
          size="sm"
        >
          <RefreshCw className="size-3.5 mr-1.5" /> Refresh Queue
        </Button>
      </div>

      {items.length === 0 ? (
        <Card className="p-10 text-center bg-white border-slate-200">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <ShieldCheck className="size-6" />
          </div>
          <h3 className="font-semibold text-slate-800 text-base">All collections verified!</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            There are no pending submissions from field collectors awaiting admin confirmation.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {items.map((item) => (
            <Card key={item.id} className="border-slate-200 hover:shadow-xs transition-shadow">
              <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 text-sm">
                      Collector: {item.collected_by}
                    </span>
                    <Badge variant="outline" className="capitalize text-[10px]">
                      {item.mode}
                    </Badge>
                    {item.is_delayed && (
                      <Badge variant="destructive" className="flex items-center gap-1 text-[10px]">
                        <AlertTriangle className="size-3" /> Delayed Submission (&gt; 1 Day)
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                    <div>
                      Principal:{" "}
                      <span className="font-bold text-slate-900">
                        {formatCurrency(item.principal_amount)}
                      </span>
                    </div>
                    {item.fine_amount > 0 && (
                      <div>
                        Fine:{" "}
                        <span className="font-bold text-amber-800">
                          {formatCurrency(item.fine_amount)}
                        </span>
                      </div>
                    )}
                    <div className="text-slate-500 flex items-center gap-1">
                      <Clock className="size-3 text-slate-400" />
                      Collected: {item.collected_at.slice(0, 10)} (Received: {item.received_at.slice(0, 10)})
                    </div>
                    {item.reference && (
                      <div className="text-slate-500 italic">Ref: {item.reference}</div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setRejectingId(item.id);
                      setRejectReason("");
                    }}
                    className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 cursor-pointer"
                  >
                    <X className="size-3.5 mr-1" /> Reject
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleVerify(item.id)}
                    disabled={loading}
                    className="bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer"
                  >
                    <Check className="size-3.5 mr-1" /> Verify Receipt
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Reject Payment Reason Dialog */}
      <Dialog
        open={rejectingId !== null}
        onOpenChange={(open) => {
          if (!open) setRejectingId(null);
        }}
      >
        <DialogHeader>
          <DialogTitle>Reject Collection Submission</DialogTitle>
          <DialogDescription>
            Provide a mandatory reason for rejecting this collection. The rejection is logged in the audit trail and does not count toward loan balances.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleReject} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-700">Rejection Reason *</label>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Cash not received from collector / duplicate entry"
              required
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRejectingId(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !rejectReason.trim()}
              variant="destructive"
            >
              Confirm Rejection
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
};
