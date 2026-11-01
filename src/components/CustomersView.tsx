import React, { useState } from "react";
import { UserPlus, Search, Phone, MapPin, CreditCard, Briefcase, FileText } from "lucide-react";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Card, CardContent } from "./ui/Card";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/Dialog";
import { api, Person } from "@/lib/api";

interface CustomersViewProps {
  persons: Person[];
  onRefresh: () => void;
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  persons,
  onRefresh,
}) => {
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [aadhaar, setAadhaar] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [altPhone, setAltPhone] = useState("");
  const [occupation, setOccupation] = useState("");
  const [remarks, setRemarks] = useState("");

  const filtered = persons.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.phone.includes(q) ||
      p.aadhaar.includes(q) ||
      p.address.toLowerCase().includes(q)
    );
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !aadhaar.trim() || !address.trim() || !phone.trim()) {
      setError("Please fill all required fields (*)");
      return;
    }

    setLoading(true);
    try {
      await api.createPerson({
        name: name.trim(),
        aadhaar: aadhaar.trim(),
        address: address.trim(),
        phone: phone.trim(),
        alternate_phone: altPhone.trim() || null,
        occupation: occupation.trim() || null,
        remarks: remarks.trim() || null,
      });
      // Reset form
      setName("");
      setAadhaar("");
      setAddress("");
      setPhone("");
      setAltPhone("");
      setOccupation("");
      setRemarks("");
      setModalOpen(false);
      onRefresh();
    } catch (err: unknown) {
      setError(typeof err === "string" ? err : "Failed to save person record");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Customers & Guarantors</h2>
          <p className="text-xs text-slate-500">
            Encrypted local records. Aadhaar and contact numbers are never shared to the cloud.
          </p>
        </div>
        <Button
          onClick={() => setModalOpen(true)}
          className="bg-teal-700 hover:bg-teal-800 text-white cursor-pointer"
        >
          <UserPlus className="size-4 mr-1.5" /> Add Customer / Guarantor
        </Button>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Input
          placeholder="Search by name, phone, Aadhaar or address..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-white"
        />
        <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
      </div>

      {/* Person Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((person) => (
          <Card key={person.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-semibold text-slate-900 text-base">{person.name}</h4>
                  {person.occupation && (
                    <span className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                      <Briefcase className="size-3.5" /> {person.occupation}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1.5 text-xs text-slate-600 mt-1">
                <div className="flex items-center gap-2">
                  <CreditCard className="size-3.5 text-slate-400 shrink-0" />
                  <span className="font-mono text-slate-700 font-medium">
                    Aadhaar: {person.aadhaar}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="size-3.5 text-slate-400 shrink-0" />
                  <span>
                    {person.phone}
                    {person.alternate_phone ? ` / ${person.alternate_phone}` : ""}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="size-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span className="line-clamp-2">{person.address}</span>
                </div>
                {person.remarks && (
                  <div className="flex items-start gap-2 pt-1 border-t border-slate-100 text-slate-500">
                    <FileText className="size-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span className="italic">{person.remarks}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full p-8 text-center bg-white rounded-xl border border-dashed border-slate-300">
            <p className="text-sm text-slate-500">No customer records found.</p>
          </div>
        )}
      </div>

      {/* Add Person Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogHeader>
          <DialogTitle>Add Person Record</DialogTitle>
          <DialogDescription>
            Record customer or guarantor details. This information is saved locally into the encrypted database.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleCreate} className="flex flex-col gap-3.5">
          {error && (
            <div className="p-2.5 text-xs rounded-lg bg-red-50 text-red-700 border border-red-200">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-700">Full Name *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ramesh Kumar"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-700">Aadhaar Number *</label>
              <Input
                value={aadhaar}
                onChange={(e) => setAadhaar(e.target.value)}
                placeholder="12-digit number"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-700">Phone *</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Primary phone"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-700">Alternate Phone</label>
              <Input
                value={altPhone}
                onChange={(e) => setAltPhone(e.target.value)}
                placeholder="Optional backup phone"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-700">Occupation</label>
              <Input
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
                placeholder="e.g. Shopkeeper, Driver"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-700">Full Address *</label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street, Landmark, Locality, City"
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-700">Remarks</label>
            <Input
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Any notes or document collection references"
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
              {loading ? "Saving..." : "Save Record"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
};
