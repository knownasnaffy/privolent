import React, { useState } from "react";
import { Lock, ShieldCheck, KeyRound, AlertCircle } from "lucide-react";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./ui/Card";
import { api } from "@/lib/api";

interface UnlockScreenProps {
  isInitialized: boolean;
  onUnlocked: () => void;
}

export const UnlockScreen: React.FC<UnlockScreenProps> = ({
  isInitialized,
  onUnlocked,
}) => {
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!passphrase.trim()) {
      setError("Please enter your passphrase");
      return;
    }

    if (!isInitialized && passphrase !== confirmPassphrase) {
      setError("Passphrases do not match");
      return;
    }

    setLoading(true);
    try {
      await api.unlockDatabase(passphrase);
      onUnlocked();
    } catch (err: unknown) {
      console.error(err);
      setError(
        typeof err === "string"
          ? err
          : "Invalid passphrase or database could not be decrypted."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <Card className="w-full max-w-md shadow-2xl border-slate-800 bg-slate-950 text-white">
        <CardHeader className="text-center border-slate-800 pb-4">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20">
            {isInitialized ? <Lock className="size-6" /> : <ShieldCheck className="size-6" />}
          </div>
          <CardTitle className="text-xl text-white">
            {isInitialized ? "Unlock Loan Collector" : "Setup Encrypted Database"}
          </CardTitle>
          <CardDescription className="text-slate-400 text-xs">
            {isInitialized
              ? "Your local SQLite database is encrypted with SQLCipher & Argon2id. Enter your admin passphrase to unlock."
              : "Create an admin passphrase to encrypt your local database. Lost passphrases cannot be recovered."}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="flex flex-col gap-4 py-4">
            {error && (
              <div className="flex items-center gap-2 p-3 text-xs rounded-lg bg-red-950/60 border border-red-800 text-red-300">
                <AlertCircle className="size-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-300">
                {isInitialized ? "Admin Passphrase" : "New Admin Passphrase"}
              </label>
              <div className="relative">
                <Input
                  type="password"
                  placeholder="Enter passphrase..."
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-teal-500 pr-10"
                  autoFocus
                />
                <KeyRound className="absolute right-3 top-2.5 size-4 text-slate-500" />
              </div>
            </div>

            {!isInitialized && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-300">
                  Confirm Passphrase
                </label>
                <Input
                  type="password"
                  placeholder="Confirm passphrase..."
                  value={confirmPassphrase}
                  onChange={(e) => setConfirmPassphrase(e.target.value)}
                  className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-teal-500"
                />
              </div>
            )}
          </CardContent>
          <CardFooter className="pt-2">
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-teal-600 hover:bg-teal-500 text-white font-medium py-2.5 cursor-pointer"
            >
              {loading
                ? "Deriving key & decrypting..."
                : isInitialized
                ? "Unlock Database"
                : "Initialize & Encrypt"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};
