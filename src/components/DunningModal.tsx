// =============================================================
// MahnungsModal: Zeigt alle Mieter mit Rückstand,
// ermöglicht Einzel- und Sammel-Mahnung als DOCX-Download
// =============================================================
"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  generateDunningLetter,
  getNextDunningLevel,
  calcOpenMonths,
  type DunningInput,
} from "@/services/dunning";

interface DunningModalProps {
  isOpen: boolean;
  onClose: () => void;
  objectId: string;
  objectName: string;
  objectAddress: string;
  objectIban: string | null;
  objectBic: string | null;
  // Vermieter-Daten (vom Objekt)
  landlordName: string | null;
  landlordAddress: string | null;
  landlordCity: string | null;
  landlordPhone: string | null;
  landlordEmail: string | null;
  // Live-Daten
  tenants: {
    id: string;
    name: string;
    unit_label: string;
    rent_total: number;
    is_active: boolean;
    address?: string;
    wg_main_tenant_id?: string | null;
  }[];
  transactions: {
    id: string;
    tenant_id: string | null;
    date: string;
    amount: number;
    month_period: string;
  }[];
}

export default function DunningModal({
  isOpen,
  onClose,
  objectId,
  objectName,
  objectAddress,
  objectIban,
  objectBic,
  landlordName,
  landlordAddress,
  landlordCity,
  landlordPhone,
  landlordEmail,
  tenants,
  transactions,
}: DunningModalProps) {
  const [dunningLogs, setDunningLogs] = useState<
    { tenant_id: string; level: number; created_at: string }[]
  >([]);
  const [selectedTenants, setSelectedTenants] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [deadlineDays, setDeadlineDays] = useState(14);
  const [missingLandlord, setMissingLandlord] = useState(false);

  // Mahn-Historie laden
  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      const { data } = await supabase
        .from("dunning_log")
        .select("tenant_id, level, created_at")
        .eq("object_id", objectId)
        .order("created_at", { ascending: false });
      if (data) setDunningLogs(data);
    })();
  }, [isOpen, objectId]);

  // Prüfe ob Vermieter-Daten vorhanden
  useEffect(() => {
    setMissingLandlord(!landlordName || !landlordAddress || !landlordCity);
  }, [landlordName, landlordAddress, landlordCity]);

  // Zahlende Mieter mit Rückstand ermitteln
  const tenantsWithArrears = useMemo(() => {
    // Alle Monate mit Daten
    const allMonths = [
      ...new Set(transactions.filter((t) => t.tenant_id).map((t) => t.month_period)),
    ].sort();

    return tenants
      .filter(
        (t) =>
          t.is_active &&
          t.rent_total > 0 &&
          t.name.toLowerCase() !== "leerstand" &&
          !t.wg_main_tenant_id
      )
      .map((tenant) => {
        const openMonths = calcOpenMonths(tenant.id, tenant.rent_total, transactions, allMonths);
        const totalDebt = openMonths.reduce((s, m) => s + m.diff, 0);

        // Letzte Mahnstufe für diesen Mieter
        const logs = dunningLogs.filter((l) => l.tenant_id === tenant.id);
        const nextLevel = getNextDunningLevel(logs);
        const lastDunning = logs.length > 0 ? logs[0] : null;

        return {
          ...tenant,
          openMonths,
          totalDebt,
          nextLevel,
          lastDunning,
        };
      })
      .filter((t) => t.totalDebt > 0);
  }, [tenants, transactions, dunningLogs]);

  // Alle auswählen / abwählen
  const toggleAll = () => {
    if (selectedTenants.size === tenantsWithArrears.length) {
      setSelectedTenants(new Set());
    } else {
      setSelectedTenants(new Set(tenantsWithArrears.map((t) => t.id)));
    }
  };

  const toggleTenant = (id: string) => {
    const next = new Set(selectedTenants);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedTenants(next);
  };

  // Stufen-Label
  const levelLabel = (level: 1 | 2 | 3) => {
    switch (level) {
      case 1: return "Erinnerung";
      case 2: return "1. Mahnung";
      case 3: return "2. Mahnung";
    }
  };

  // Stufen-Farbe
  const levelColor = (level: 1 | 2 | 3) => {
    switch (level) {
      case 1: return "text-blue-700 bg-blue-50 border-blue-200";
      case 2: return "text-amber-700 bg-amber-50 border-amber-200";
      case 3: return "text-red-700 bg-red-50 border-red-200";
    }
  };

  // Einzelne Mahnung generieren + downloaden
  const generateSingle = async (tenant: (typeof tenantsWithArrears)[0]) => {
    if (missingLandlord) return;
    setGenerating(true);
    try {
      const input: DunningInput = {
        landlordName: landlordName!,
        landlordAddress: landlordAddress!,
        landlordCity: landlordCity!,
        landlordPhone: landlordPhone || undefined,
        landlordEmail: landlordEmail || undefined,
        landlordIban: objectIban || "",
        landlordBic: objectBic || undefined,
        tenantName: tenant.name,
        tenantAddress: tenant.address,
        objectName,
        unitLabel: tenant.unit_label,
        level: tenant.nextLevel,
        totalDebt: tenant.totalDebt,
        monthsOpen: tenant.openMonths,
        deadlineDays,
      };

      const result = await generateDunningLetter(input);

      // Download auslösen
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);

      // In dunning_log speichern
      await supabase.from("dunning_log").insert({
        object_id: objectId,
        tenant_id: tenant.id,
        level: tenant.nextLevel,
        amount: tenant.totalDebt,
        months: tenant.openMonths.map((m) => m.month),
        deadline: new Date(Date.now() + deadlineDays * 86400000).toISOString().split("T")[0],
      });

      // Logs neu laden
      const { data } = await supabase
        .from("dunning_log")
        .select("tenant_id, level, created_at")
        .eq("object_id", objectId)
        .order("created_at", { ascending: false });
      if (data) setDunningLogs(data);
    } catch (err) {
      alert("Fehler beim Generieren: " + err);
    }
    setGenerating(false);
  };

  // Sammel-Mahnung für alle ausgewählten Mieter
  const generateBulk = async () => {
    if (missingLandlord || selectedTenants.size === 0) return;
    setGenerating(true);
    try {
      for (const tenant of tenantsWithArrears.filter((t) => selectedTenants.has(t.id))) {
        const input: DunningInput = {
          landlordName: landlordName!,
          landlordAddress: landlordAddress!,
          landlordCity: landlordCity!,
          landlordPhone: landlordPhone || undefined,
          landlordEmail: landlordEmail || undefined,
          landlordIban: objectIban || "",
          landlordBic: objectBic || undefined,
          tenantName: tenant.name,
          tenantAddress: tenant.address,
          objectName,
          unitLabel: tenant.unit_label,
          level: tenant.nextLevel,
          totalDebt: tenant.totalDebt,
          monthsOpen: tenant.openMonths,
          deadlineDays,
        };

        const result = await generateDunningLetter(input);

        // Download
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.filename;
        a.click();
        URL.revokeObjectURL(url);

        // Log
        await supabase.from("dunning_log").insert({
          object_id: objectId,
          tenant_id: tenant.id,
          level: tenant.nextLevel,
          amount: tenant.totalDebt,
          months: tenant.openMonths.map((m) => m.month),
          deadline: new Date(Date.now() + deadlineDays * 86400000).toISOString().split("T")[0],
        });

        // Kurz warten zwischen Downloads (damit Browser nicht blockiert)
        await new Promise((r) => setTimeout(r, 500));
      }

      // Logs neu laden
      const { data } = await supabase
        .from("dunning_log")
        .select("tenant_id, level, created_at")
        .eq("object_id", objectId)
        .order("created_at", { ascending: false });
      if (data) setDunningLogs(data);
      setSelectedTenants(new Set());
    } catch (err) {
      alert("Fehler beim Generieren: " + err);
    }
    setGenerating(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Mahnwesen – {objectName}</h2>
          <p className="text-sm text-gray-500 mt-1">
            {tenantsWithArrears.length} Mieter mit Rückstand
          </p>
        </div>

        {/* Vermieter-Daten fehlen */}
        {missingLandlord && (
          <div className="mx-5 mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-sm text-amber-800 font-medium">
              Absender-Daten fehlen. Bitte hinterlegen Sie Name, Adresse und Ort des Vermieters in den Objekt-Einstellungen.
            </p>
          </div>
        )}

        {/* Scrollbarer Inhalt */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {tenantsWithArrears.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Alle Mieter haben bezahlt. Keine Mahnungen nötig.
            </div>
          ) : (
            <>
              {/* Frist einstellen */}
              <div className="flex items-center gap-3 mb-2">
                <label className="text-sm text-gray-600">Zahlungsfrist:</label>
                <select
                  value={deadlineDays}
                  onChange={(e) => setDeadlineDays(Number(e.target.value))}
                  className="px-2 py-1 border border-gray-300 rounded-lg text-sm"
                >
                  <option value={7}>7 Tage</option>
                  <option value={14}>14 Tage</option>
                  <option value={21}>21 Tage</option>
                  <option value={30}>30 Tage</option>
                </select>
              </div>

              {/* Sammel-Auswahl */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedTenants.size === tenantsWithArrears.length}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600"
                  />
                  Alle auswählen
                </label>
                {selectedTenants.size > 0 && (
                  <button
                    onClick={generateBulk}
                    disabled={generating || missingLandlord}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {generating
                      ? "Generiere..."
                      : `${selectedTenants.size} Mahnungen erstellen`}
                  </button>
                )}
              </div>

              {/* Mieter-Liste */}
              {tenantsWithArrears.map((tenant) => (
                <div
                  key={tenant.id}
                  className="border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedTenants.has(tenant.id)}
                        onChange={() => toggleTenant(tenant.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 mt-1"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{tenant.name}</span>
                          <span className="text-xs text-gray-500">{tenant.unit_label}</span>
                          <span
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${levelColor(tenant.nextLevel)}`}
                          >
                            {levelLabel(tenant.nextLevel)}
                          </span>
                        </div>

                        {/* Offene Monate */}
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {tenant.openMonths.map((m) => (
                            <span
                              key={m.month}
                              className="text-[10px] text-red-700 bg-red-50 px-1.5 py-0.5 rounded"
                            >
                              {m.month.split("-")[1]}/{m.month.split("-")[0].slice(2)}: -{m.diff.toLocaleString("de-DE", { maximumFractionDigits: 0 })} €
                            </span>
                          ))}
                        </div>

                        {/* Letzte Mahnung */}
                        {tenant.lastDunning && (
                          <p className="text-[10px] text-gray-400 mt-1">
                            Letzte Mahnung: {levelLabel(tenant.lastDunning.level as 1 | 2 | 3)} am{" "}
                            {new Date(tenant.lastDunning.created_at).toLocaleDateString("de-DE")}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Rechts: Betrag + Button */}
                    <div className="text-right shrink-0 ml-4">
                      <p className="text-base font-bold text-red-600">
                        {tenant.totalDebt.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                      </p>
                      <button
                        onClick={() => generateSingle(tenant)}
                        disabled={generating || missingLandlord}
                        className="mt-1.5 px-2.5 py-1 text-[11px] font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50 transition-colors"
                      >
                        {generating ? "..." : "DOCX erstellen"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
