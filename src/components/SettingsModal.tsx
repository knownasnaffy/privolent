import React, { useState } from "react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
} from "./ui/Dialog";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Card, CardContent } from "./ui/Card";
import { api, BackupMetadata, ImportSummary } from "@/lib/api";
import { Shield, Download, Upload, FileJson, FileSpreadsheet, CheckCircle2 } from "lucide-react";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefreshAll: () => void;
}

export function SettingsModal({
  open,
  onOpenChange,
  onRefreshAll,
}: SettingsModalProps) {
  const [activeSection, setActiveSection] = useState<"backup" | "export" | "import">("backup");

  // Backup state
  const [backupPath, setBackupPath] = useState("/tmp/privolent_backup.encbak");
  const [restorePath, setRestorePath] = useState("");
  const [backupResult, setBackupResult] = useState<BackupMetadata | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);

  // JSON Export state
  const [jsonExport, setJsonExport] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  // CSV Import state
  const [csvContent, setCsvContent] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleExportBackup = async () => {
    if (!backupPath.trim()) return;
    setBackupLoading(true);
    setBackupMessage(null);
    try {
      const res = await api.exportEncryptedBackup(backupPath.trim());
      setBackupResult(res);
      setBackupMessage(`Encrypted archive saved successfully! (${(res.archive_size_bytes / 1024).toFixed(1)} KB)`);
    } catch (err: unknown) {
      setBackupMessage(`Error exporting backup: ${typeof err === "string" ? err : String(err)}`);
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (!restorePath.trim()) return;
    if (!confirm("Restoring will replace your current active database with the backup archive. The app will lock after restore. Continue?")) {
      return;
    }
    setBackupLoading(true);
    try {
      await api.restoreEncryptedBackup(restorePath.trim());
      alert("Database restored successfully! Re-enter your passphrase to unlock.");
      onOpenChange(false);
      window.location.reload();
    } catch (err: unknown) {
      alert(`Restore failed: ${typeof err === "string" ? err : String(err)}`);
    } finally {
      setBackupLoading(false);
    }
  };

  const handleExportJson = async () => {
    setExportLoading(true);
    try {
      const json = await api.exportDecryptedJson();
      setJsonExport(json);
    } catch (err: unknown) {
      alert(`Export failed: ${typeof err === "string" ? err : String(err)}`);
    } finally {
      setExportLoading(false);
    }
  };

  const handleDownloadJsonFile = () => {
    if (!jsonExport) return;
    const blob = new Blob([jsonExport], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `privolent_decrypted_export_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCsv = async () => {
    if (!csvContent.trim()) {
      setImportError("Please provide CSV content with loans data");
      return;
    }
    setImportLoading(true);
    setImportError(null);
    setImportSummary(null);
    try {
      const summary = await api.importLegacyLoans(csvContent.trim());
      setImportSummary(summary);
      onRefreshAll();
    } catch (err: unknown) {
      setImportError(typeof err === "string" ? err : String(err));
    } finally {
      setImportLoading(false);
    }
  };

  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setCsvContent(event.target?.result as string || "");
    };
    reader.readAsText(file);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div className="space-y-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Shield className="size-5 text-teal-700" /> System Settings & Data Operations
          </DialogTitle>
        </DialogHeader>

        <div className="flex border-b border-slate-200 mt-2 mb-4 space-x-2">
          <button
            onClick={() => setActiveSection("backup")}
            className={`pb-2 px-3 text-xs font-semibold border-b-2 cursor-pointer ${
              activeSection === "backup"
                ? "border-teal-700 text-teal-800"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Encrypted Backup
          </button>
          <button
            onClick={() => setActiveSection("export")}
            className={`pb-2 px-3 text-xs font-semibold border-b-2 cursor-pointer ${
              activeSection === "export"
                ? "border-teal-700 text-teal-800"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Decrypted JSON Export
          </button>
          <button
            onClick={() => setActiveSection("import")}
            className={`pb-2 px-3 text-xs font-semibold border-b-2 cursor-pointer ${
              activeSection === "import"
                ? "border-teal-700 text-teal-800"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Legacy CSV Import
          </button>
        </div>

        {/* Encrypted Backup Section */}
        {activeSection === "backup" && (
          <div className="space-y-5">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              <span className="font-semibold">Security Note:</span> Encrypted backups bundle your raw SQLCipher database and Argon2id salt into a single compressed <code>.encbak</code> archive. Without your passphrase, it is unreadable.
            </div>

            <Card>
              <CardContent className="pt-4 space-y-3">
                <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                  <Download className="size-4 text-teal-700" /> Export Encrypted Backup (.encbak)
                </h4>
                <div className="flex gap-2">
                  <Input
                    value={backupPath}
                    onChange={(e) => setBackupPath(e.target.value)}
                    placeholder="/path/to/destination/privolent.encbak"
                    className="flex-1 font-mono text-xs"
                  />
                  <Button
                    onClick={handleExportBackup}
                    disabled={backupLoading}
                    className="bg-teal-700 hover:bg-teal-800 text-white cursor-pointer"
                  >
                    {backupLoading ? "Exporting..." : "Export"}
                  </Button>
                </div>
                {backupMessage && (
                  <div className="text-xs font-medium text-teal-800 bg-teal-50 p-2 rounded border border-teal-100">
                    {backupMessage}
                  </div>
                )}
                {backupResult && (
                  <div className="text-[11px] text-slate-500 space-y-0.5">
                    <div>Encrypted DB: {(backupResult.db_size_bytes / 1024).toFixed(1)} KB</div>
                    <div>Salt: {backupResult.salt_size_bytes} bytes</div>
                    <div>Exported At: {new Date(backupResult.exported_at).toLocaleString()}</div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 space-y-3">
                <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                  <Upload className="size-4 text-slate-700" /> Restore Encrypted Backup
                </h4>
                <div className="flex gap-2">
                  <Input
                    value={restorePath}
                    onChange={(e) => setRestorePath(e.target.value)}
                    placeholder="/path/to/source/privolent.encbak"
                    className="flex-1 font-mono text-xs"
                  />
                  <Button
                    onClick={handleRestoreBackup}
                    disabled={backupLoading || !restorePath.trim()}
                    variant="outline"
                    className="cursor-pointer border-red-200 text-red-700 hover:bg-red-50"
                  >
                    Restore
                  </Button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Target file must be a valid <code>.encbak</code> archive created with the same passphrase.
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Decrypted JSON Export Section */}
        {activeSection === "export" && (
          <div className="space-y-4">
            <p className="text-xs text-slate-600">
              Generate a full, decrypted JSON dump of all customers, loans, and payment history for offline bookkeeping, accountant audit, or custom reports.
            </p>
            <div className="flex items-center gap-3">
              <Button
                onClick={handleExportJson}
                disabled={exportLoading}
                className="bg-teal-700 hover:bg-teal-800 text-white cursor-pointer"
              >
                <FileJson className="size-4 mr-1.5" />
                {exportLoading ? "Generating..." : "Generate Decrypted JSON"}
              </Button>
              {jsonExport && (
                <Button
                  onClick={handleDownloadJsonFile}
                  variant="outline"
                  className="cursor-pointer border-teal-300 text-teal-800"
                >
                  <Download className="size-4 mr-1.5" /> Save JSON File
                </Button>
              )}
            </div>

            {jsonExport && (
              <div className="mt-4">
                <div className="flex justify-between items-center text-xs text-slate-500 mb-1">
                  <span>JSON Preview</span>
                  <span>{(jsonExport.length / 1024).toFixed(1)} KB</span>
                </div>
                <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg text-xs font-mono max-h-60 overflow-y-auto">
                  {jsonExport}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Legacy CSV Import Section */}
        {activeSection === "import" && (
          <div className="space-y-4">
            <p className="text-xs text-slate-600">
              Import running loans from previous Excel sheets with opening balances. The importer will automatically create customer records, loans, and initial verified payments for already-collected principal or fines.
            </p>

            <div className="flex items-center gap-3">
              <label className="cursor-pointer inline-flex items-center justify-center rounded-md text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 px-3 py-2 text-slate-700 shadow-2xs">
                <FileSpreadsheet className="size-4 mr-1.5 text-teal-700" />
                Select CSV File
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleCsvFileUpload}
                  className="hidden"
                />
              </label>
              <span className="text-[11px] text-slate-400">or paste CSV text directly below</span>
            </div>

            <textarea
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
              placeholder={`customer_name,phone,aadhaar,address,loan_amount,interest_amount,day_amount,fine_per_day,start_date,principal_repaid,fine_paid\nSatnam Singh,9876543210,123456789012,Street 5 Amritsar,10000,1000,100,20,2026-10-01,3000,100`}
              rows={6}
              className="w-full text-xs font-mono p-2.5 border border-slate-300 rounded-md focus:outline-teal-600 bg-white"
            />

            {importError && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 p-2.5 rounded">
                {importError}
              </div>
            )}

            {importSummary && (
              <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-xs text-emerald-800 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <CheckCircle2 className="size-4 text-emerald-600" /> Import Successful!
                </div>
                <div>• Customers created: {importSummary.imported_persons_count}</div>
                <div>• Loans imported: {importSummary.imported_loans_count}</div>
                <div>• Opening payments recorded: {importSummary.opening_payments_count}</div>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                onClick={handleImportCsv}
                disabled={importLoading || !csvContent.trim()}
                className="bg-teal-700 hover:bg-teal-800 text-white cursor-pointer"
              >
                {importLoading ? "Importing..." : "Run Import"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
