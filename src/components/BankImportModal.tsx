"use client";

import { useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { parseBankCSV, RawTransaction } from "@/lib/bankParser";

interface Tenant {
  id: string;
  number: string | null;
  name: string;
  unit_label: string;
  rent_total: number;
}

interface MatchResult {
  date: string;
  amount: number;
  purpose: string;
  sender: string;
  tenant_id: string | null;
  tenant_name: string | null;
  confidence: number;
  match_reason: string;
  status: "matched" | "unclear" | "missing";
}

export default function BankImportModal({
  isOpen,
  onClose,
  onImported,
  objectId,
  tenants,
}: {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
  objectId: string;
  tenants: Tenant[];
}) {
  const [step, setStep] = useState<"upload" | "matching" | "review" | "done">(
    "upload"
  );
  const [transactions, setTransactions] = useState<RawTransaction[]>([]);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{
    success: number;
    failed: number;
    skipped: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileType, setFileType] = useState<"csv" | "pdf" | null>(null);

  if (!isOpen) return null;

const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPDF = file.name.toLowerCase().endsWith(".pdf");
    setFileType(isPDF ? "pdf" : "csv");

    setStep("matching");
    setLoading(true);
    setParseErrors([]);

    try {
      if (isPDF) {
        // PDF-Flow: direkt als FormData an API
        const formData = new FormData();
        formData.append("pdf", file);
        formData.append("tenants", JSON.stringify(tenants));

        const response = await fetch("/api/match", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || response.statusText);
        }

        const data = await response.json();
        setTransactions([]); // PDF-Transaktionen kommen nur als Results zurück
        setResults(data.results);
        setStep("review");
      } else {
        // CSV/XLSX-Flow: bisheriger Weg
        const buffer = await file.arrayBuffer();
        const parsed = parseBankCSV(buffer);

        setTransactions(parsed.transactions);
        setParseErrors(parsed.errors);

        if (parsed.transactions.length === 0) {
          setStep("upload");
          setLoading(false);
          return;
        }

        const response = await fetch("/api/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transactions: parsed.transactions,
            tenants: tenants,
          }),
        });

        if (!response.ok) {
          throw new Error("API-Fehler: " + response.statusText);
        }

        const data = await response.json();
        setResults(data.results);
        setStep("review");
      }
    } catch (error) {
      setParseErrors(["Fehler: " + (error as Error).message]);
      setStep("upload");
    }

    setLoading(false);
  };

  const handleChangeTenant = (index: number, tenantId: string | null) => {
    setResults((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const tenant = tenants.find((t) => t.id === tenantId);
        return {
          ...r,
          tenant_id: tenantId,
          tenant_name: tenant?.name || null,
          confidence: tenantId ? 1.0 : 0,
          match_reason: tenantId ? "Manuell zugeordnet" : "Nicht zugeordnet",
          status: tenantId ? ("matched" as const) : ("missing" as const),
        };
      })
    );
  };

  const handleSave = async () => {
    setSaving(true);
    let success = 0;
    let failed = 0;
    let skipped = 0;

    // Bestehende Transaktionen laden für Duplikat-Check
    const { data: existingTx } = await supabase.from("transactions")
      .select("date, amount, purpose_raw")
      .eq("object_id", objectId);
    const existingKeys = new Set(
      (existingTx || []).map((t: any) => `${t.date}|${t.amount}|${t.purpose_raw}`)
    );

    for (const result of results) {
      const monthPeriod = result.date.substring(0, 7);
      const purposeRaw = `${result.sender}: ${result.purpose}`;
      const key = `${result.date}|${result.amount}|${purposeRaw}`;

      // Duplikat-Check
      if (existingKeys.has(key)) {
        skipped++;
        continue;
      }

      const { error } = await supabase.from("transactions").insert({
        object_id: objectId,
        tenant_id: result.tenant_id,
        date: result.date,
        amount: result.amount,
        purpose_raw: purposeRaw,
        confidence: result.confidence,
        match_reason: result.match_reason,
        status: result.status,
        month_period: monthPeriod,
      });

      if (error) {
        failed++;
      } else {
        success++;
      }
    }

    setSaveResult({ success, failed, skipped });
    setStep("done");
    setSaving(false);
    onImported();
  };

  const handleClose = () => {
    setStep("upload");
    setTransactions([]);
    setResults([]);
    setParseErrors([]);
    setSaveResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onClose();
  };

  const matched = results.filter((r) => r.status === "matched");
  const unclear = results.filter((r) => r.status === "unclear");
  const missing = results.filter((r) => r.status === "missing");

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            🏦 Bankauszug importieren
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {step === "upload" &&
              "Laden Sie Ihren Bankauszug als CSV-Datei hoch."}
            {step === "matching" && "AI analysiert die Transaktionen..."}
            {step === "review" &&
              "Prüfen und korrigieren Sie die Zuordnungen."}
            {step === "done" && "Import abgeschlossen."}
          </p>
        </div>

        <div className="p-6">
          {/* Step 1: Upload */}
          {step === "upload" && (
            <div className="space-y-6">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  Kontoauszug hochladen
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  Laden Sie Ihren Kontoauszug als CSV, Excel oder PDF hoch.
                  PDF-Auszüge von Commerzbank und HypoVereinsbank werden
                  automatisch erkannt.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.pdf"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 file:cursor-pointer"
                />
              </div>

              {tenants.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-sm text-amber-800">
                    ⚠️ Importieren Sie zuerst eine Mieterliste, damit das
                    AI-Matching funktioniert.
                  </p>
                </div>
              )}

              {parseErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-red-800 mb-2">
                    Fehler beim Einlesen
                  </h3>
                  {parseErrors.map((err, i) => (
                    <p key={i} className="text-sm text-red-700">
                      {err}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Loading */}
          {step === "matching" && loading && (
            <div className="text-center py-12">
              <div className="animate-spin w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full mx-auto mb-4" />
              <h3 className="text-base font-semibold text-gray-900 mb-1">
                AI analysiert {transactions.length} Transaktionen...
              </h3>
              <p className="text-sm text-gray-500">
                Zuordnung zu {tenants.length} Mietern läuft
              </p>
            </div>
          )}

          {/* Step 3: Review */}
          {step === "review" && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-700">
                    {matched.length}
                  </p>
                  <p className="text-xs text-emerald-600">Erkannt</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-amber-700">
                    {unclear.length}
                  </p>
                  <p className="text-xs text-amber-600">Unklar</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-red-700">
                    {missing.length}
                  </p>
                  <p className="text-xs text-red-600">Nicht zugeordnet</p>
                </div>
              </div>

              {/* Matched Transactions */}
              {matched.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-emerald-800 mb-2">
                    ✅ Erkannte Zahlungen
                  </h3>
                  <div className="space-y-2">
                    {results.map(
                      (r, i) =>
                        r.status === "matched" && (
                          <TransactionRow
                            key={i}
                            result={r}
                            index={i}
                            tenants={tenants}
                            onChangeTenant={handleChangeTenant}
                          />
                        )
                    )}
                  </div>
                </div>
              )}

              {/* Unclear Transactions */}
              {unclear.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-amber-800 mb-2">
                    ⚠️ Unklare Zahlungen – bitte prüfen
                  </h3>
                  <div className="space-y-2">
                    {results.map(
                      (r, i) =>
                        r.status === "unclear" && (
                          <TransactionRow
                            key={i}
                            result={r}
                            index={i}
                            tenants={tenants}
                            onChangeTenant={handleChangeTenant}
                          />
                        )
                    )}
                  </div>
                </div>
              )}

              {/* Missing Transactions */}
              {missing.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-red-800 mb-2">
                    ❌ Nicht zugeordnet
                  </h3>
                  <div className="space-y-2">
                    {results.map(
                      (r, i) =>
                        r.status === "missing" && (
                          <TransactionRow
                            key={i}
                            result={r}
                            index={i}
                            tenants={tenants}
                            onChangeTenant={handleChangeTenant}
                          />
                        )
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Done */}
          {step === "done" && saveResult && (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">{saveResult.skipped > 0 && saveResult.success === 0 ? "ℹ️" : "🎉"}</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Bankimport abgeschlossen!
              </h3>
              <p className="text-sm text-gray-600">
                <span className="text-emerald-600 font-medium">
                  {saveResult.success} Transaktionen gespeichert
                </span>
                {saveResult.skipped > 0 && (
                  <span className="text-amber-600 font-medium">
                    {" "}· {saveResult.skipped} Duplikate übersprungen
                  </span>
                )}
                {saveResult.failed > 0 && (
                  <span className="text-red-600 font-medium">
                    {" "}· {saveResult.failed} fehlgeschlagen
                  </span>
                )}
              </p>
              {saveResult.skipped > 0 && (
                <p className="text-xs text-gray-400 mt-2">Bereits vorhandene Transaktionen wurden nicht erneut importiert.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
          {step === "upload" && (
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Abbrechen
            </button>
          )}

          {step === "review" && (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {saving
                  ? "Speichere..."
                  : `${results.length} Transaktionen speichern`}
              </button>
            </>
          )}

          {step === "done" && (
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Fertig
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TransactionRow({
  result,
  index,
  tenants,
  onChangeTenant,
}: {
  result: MatchResult;
  index: number;
  tenants: Tenant[];
  onChangeTenant: (index: number, tenantId: string | null) => void;
}) {
  const statusColors = {
    matched: "border-emerald-200 bg-emerald-50/50",
    unclear: "border-amber-200 bg-amber-50/50",
    missing: "border-red-200 bg-red-50/50",
  };

  return (
    <div
      className={`border rounded-xl p-3 ${statusColors[result.status]}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-gray-900">
              {result.amount.toLocaleString("de-DE", {
                style: "currency",
                currency: "EUR",
              })}
            </span>
            <span className="text-xs text-gray-500">{result.date}</span>
          </div>
          <p className="text-xs text-gray-600 truncate">
            {result.sender}
            {result.purpose && ` · ${result.purpose}`}
          </p>
          <p className="text-xs text-gray-400 mt-1 italic">
            {result.match_reason}
          </p>
        </div>

        <div className="flex-shrink-0 w-48">
          <select
            value={result.tenant_id || ""}
            onChange={(e) =>
              onChangeTenant(index, e.target.value || null)
            }
            className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option value="">– Nicht zuordnen –</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.unit_label})
              </option>
            ))}
          </select>
        </div>
      </div>

      {result.confidence > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                result.confidence >= 0.7
                  ? "bg-emerald-500"
                  : result.confidence >= 0.4
                  ? "bg-amber-500"
                  : "bg-red-500"
              }`}
              style={{ width: `${result.confidence * 100}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 w-10 text-right">
            {Math.round(result.confidence * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}
