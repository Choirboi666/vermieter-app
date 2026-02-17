"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface ObjectData {
  id: string;
  name: string;
  address: string;
  iban: string | null;
  bic: string | null;
  account_holder: string | null;
}

function StatusBadge({ paid, open, unclear }: { paid: number; open: number; unclear: number }) {
  return (
    <div className="flex gap-3 mt-3">
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        {paid} bezahlt
      </span>
      {open > 0 && (
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-700 bg-red-50 px-2.5 py-1 rounded-full">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          {open} offen
        </span>
      )}
      {unclear > 0 && (
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          {unclear} unklar
        </span>
      )}
    </div>
  );
}

function CreateObjectModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!name.trim() || !address.trim()) return;
    setSaving(true);

    const { error } = await supabase.from("objects").insert({
      name: name.trim(),
      address: address.trim(),
      iban: iban.trim() || null,
      bic: bic.trim() || null,
      account_holder: accountHolder.trim() || null,
    });

    if (error) {
      alert("Fehler beim Speichern: " + error.message);
    } else {
      setName("");
      setAddress("");
      setIban("");
      setBic("");
      setAccountHolder("");
      onCreated();
      onClose();
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            Neues Objekt anlegen
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Erfassen Sie die Grunddaten Ihres Mietobjekts
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Objektname *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Musterstraße 12"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Adresse *
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="z.B. 10115 Berlin"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Kontoinhaber
            </label>
            <input
              type="text"
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value)}
              placeholder="z.B. Max Mustermann"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              IBAN
            </label>
            <input
              type="text"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              placeholder="DE89 3704 0044 0532 0130 00"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              BIC
            </label>
            <input
              type="text"
              value={bic}
              onChange={(e) => setBic(e.target.value)}
              placeholder="COBADEFFXXX"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || !address.trim() || saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Speichern..." : "Objekt anlegen"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [objects, setObjects] = useState<ObjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const loadObjects = async () => {
    const { data, error } = await supabase
      .from("objects")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fehler beim Laden:", error);
    } else {
      setObjects(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadObjects();
  }, []);

  const totalUnits = 0; // TODO: wird später aus Mieterliste berechnet
  const totalOpen = 0; // TODO: wird später aus Zahlungsliste berechnet

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              🏠 Vermieter-Assistent
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Ihre Objekte im Überblick
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + Objekt anlegen
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* KPI Summary */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Objekte</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{objects.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Einheiten gesamt</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{totalUnits}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Offene Mieten</p>
            <p className="text-2xl font-bold text-red-600 mt-1">{totalOpen}</p>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12 text-gray-500">
            Objekte werden geladen...
          </div>
        )}

        {/* Empty State */}
        {!loading && objects.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🏠</div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Noch keine Objekte angelegt
            </h2>
            <p className="text-gray-500 mb-6">
              Legen Sie Ihr erstes Mietobjekt an, um loszulegen.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
            >
              + Erstes Objekt anlegen
            </button>
          </div>
        )}

        {/* Object Cards */}
        {!loading && objects.length > 0 && (
          <div className="grid gap-4">
            {objects.map((obj) => (
              <div
                key={obj.id}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {obj.name}
                    </h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {obj.address}
                      {obj.iban && ` · IBAN: ...${obj.iban.slice(-4)}`}
                    </p>
                    <StatusBadge paid={0} open={0} unclear={0} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-gray-300" title="Noch keine Daten" />
                    <svg
                      className="w-5 h-5 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8.25 4.5l7.5 7.5-7.5 7.5"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Object Modal */}
      <CreateObjectModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onCreated={loadObjects}
      />
    </div>
  );
}
