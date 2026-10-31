import React, { useState } from "react";
import { UserCheck, UserX, UserPlus, Smartphone } from "lucide-react";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Badge } from "./ui/Badge";
import { Card, CardContent } from "./ui/Card";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/Dialog";
import { api, CollectorAccount } from "@/lib/api";

interface CollectorsViewProps {
  collectors: CollectorAccount[];
  onRefresh: () => void;
}

export const CollectorsView: React.FC<CollectorsViewProps> = ({
  collectors,
  onRefresh,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    setLoading(true);
    setError(null);
    try {
      await api.createCollector(username.trim());
      setUsername("");
      setModalOpen(false);
      onRefresh();
    } catch (err: unknown) {
      setError(typeof err === "string" ? err : "Failed to create collector");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (collectorId: string, currentActive: boolean) => {
    try {
      await api.toggleCollectorStatus(collectorId, !currentActive);
      onRefresh();
    } catch (err: unknown) {
      alert(typeof err === "string" ? err : "Failed to update collector status");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Collector Accounts</h2>
          <p className="text-xs text-slate-500">
            Field agents who use the mobile PWA to collect daily payments. Collectors have submission-only access.
          </p>
        </div>
        <Button
          onClick={() => setModalOpen(true)}
          className="bg-teal-700 hover:bg-teal-800 text-white cursor-pointer"
        >
          <UserPlus className="size-4 mr-1.5" /> Add Field Collector
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {collectors.map((col) => (
          <Card key={col.id} className="border-slate-200">
            <CardContent className="p-5 flex flex-col justify-between gap-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-sm">
                    {col.username.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 text-base">{col.username}</h4>
                    <span className="text-xs text-slate-400">Created: {col.created_at.slice(0, 10)}</span>
                  </div>
                </div>
                {col.active ? (
                  <Badge variant="success">Active</Badge>
                ) : (
                  <Badge variant="destructive">Deactivated</Badge>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Smartphone className="size-3.5 text-slate-400" /> PWA Access
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleToggle(col.id, col.active)}
                  className={`text-xs h-7 cursor-pointer ${
                    col.active
                      ? "text-red-700 hover:bg-red-50 hover:border-red-200"
                      : "text-emerald-700 hover:bg-emerald-50 hover:border-emerald-200"
                  }`}
                >
                  {col.active ? (
                    <>
                      <UserX className="size-3 mr-1" /> Deactivate
                    </>
                  ) : (
                    <>
                      <UserCheck className="size-3 mr-1" /> Activate
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {collectors.length === 0 && (
          <div className="col-span-full p-8 text-center bg-white rounded-xl border border-dashed border-slate-300">
            <p className="text-sm text-slate-500">No collector accounts created yet.</p>
          </div>
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogHeader>
          <DialogTitle>Create Collector Account</DialogTitle>
          <DialogDescription>
            Account credentials can be used on the field collector mobile PWA to log in and submit payments.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          {error && (
            <div className="p-2.5 text-xs rounded-lg bg-red-50 text-red-700 border border-red-200">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-700">Collector Username *</label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. sukhdev_singh"
              required
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-teal-700 hover:bg-teal-800 text-white"
            >
              {loading ? "Creating..." : "Create Account"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
};
