"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

// === Typen ===
interface ObjectData {
  id: string;
  name: string;
  address: string;
  iban: string | null;
  bic: string | null;
  account_holder: string | null;
}

interface TenantRow {
  id: string;
  object_id: string;
  name: string;
  rent_total: number;
  is_active: boolean;
  move_in_date: string | null;
  lease_end: string | null;
  wg_main_tenant_id?: string | null;
  wg_type?: string | null;
  [key: string]: any; // Weitere Spalten erlauben
}

interface TransactionRow {
  id: string;
  object_id: string;
  tenant_id: string | null;
  date: string;
  amount: number;
  status: string;
  month_period: string;
}

// === Hilfsfunktionen ===

// Aktuellen Monat als "YYYY-MM" (berücksichtigt 25-Tage-Regel)
function getCurrentMonth(): string {
  const now = new Date();
  if (now.getDate() < 25) {
    const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const m = now.getMonth() === 0 ? 12 : now.getMonth();
    return `${y}-${String(m).padStart(2, "0")}`;
  }
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Vormonat berechnen
function getPreviousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

// Monat formatieren: "2026-01" → "Jan 2026"
function formatMonth(month: string): string {
  const [y, m] = month.split("-");
  const names = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  return `${names[parseInt(m) - 1]} ${y}`;
}

// === Objekt-Anlegen Modal ===
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
      setName(""); setAddress(""); setIban(""); setBic(""); setAccountHolder("");
      onCreated();
      onClose();
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Neues Objekt anlegen</h2>
          <p className="text-sm text-gray-500 mt-1">Erfassen Sie die Grunddaten Ihres Mietobjekts</p>
        </div>
        <div className="p-6 space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Objektname *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Musterstraße 12"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Adresse *</label>
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="z.B. 10115 Berlin"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Kontoinhaber</label>
            <input type="text" value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} placeholder="z.B. Max Mustermann"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">IBAN</label>
            <input type="text" value={iban} onChange={(e) => setIban(e.target.value)} placeholder="DE89 3704 0044 0532 0130 00"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">BIC</label>
            <input type="text" value={bic} onChange={(e) => setBic(e.target.value)} placeholder="COBADEFFXXX"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" /></div>
        </div>
        <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Abbrechen</button>
          <button onClick={handleSave} disabled={!name.trim() || !address.trim() || saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? "Speichern..." : "Objekt anlegen"}
          </button>
        </div>
      </div>
    </div>
  );
}

// === Hauptseite ===
export default function Home() {
  const [objects, setObjects] = useState<ObjectData[]>([]);
  const [allTenants, setAllTenants] = useState<TenantRow[]>([]);
  const [allTransactions, setAllTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const router = useRouter();

  // Alle Daten laden: Objekte + Mieter + Transaktionen
  const loadData = async () => {
    const [objRes, tenRes, txRes] = await Promise.all([
      supabase.from("objects").select("*").order("created_at", { ascending: false }),
      supabase.from("tenants").select("*"),
      supabase.from("transactions").select("id, object_id, tenant_id, date, amount, status, month_period"),
    ]);
    if (objRes.data) setObjects(objRes.data);
    if (tenRes.data) setAllTenants(tenRes.data);
    if (txRes.data) setAllTransactions(txRes.data);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const currentMonth = getCurrentMonth();

  // === KPIs pro Objekt berechnen ===
  const objectStats = useMemo(() => {
    const stats = new Map<string, {
      units: number;
      activeTenants: number;
      vacancy: number;
      totalRent: number;
      paidMonth: number;
      paid: number;
      open: number;
      unclear: number;
      saldoMonth: number;
      saldoCumulative: number;
      paymentRate: number;
      latestMonth: string | null;
      earliestMonth: string | null;
      currentMonthImported: boolean;
      leaseWarnings: number;
    }>();

    objects.forEach((obj) => {
      const tenants = allTenants.filter((t) => t.object_id === obj.id);
      const active = tenants.filter((t) => t.is_active);
      // Zahlende Mieter: aktiv, Miete > 0, kein Leerstand, keine WG-Unter-Mieter
      const paying = active.filter((t) =>
        t.rent_total > 0 &&
        t.name.toLowerCase() !== "leerstand" &&
        !t.wg_main_tenant_id
      );
      const vacancy = active.filter((t) => t.name.toLowerCase() === "leerstand").length;
      const txForObj = allTransactions.filter((t) => t.object_id === obj.id);

      // Welche Monate haben zugeordnete Transaktionen?
      const monthsWithData = [...new Set(txForObj.filter((t) => t.tenant_id).map((t) => t.month_period))].sort();
      const latestMonth = monthsWithData.length > 0 ? monthsWithData[monthsWithData.length - 1] : null;
      const earliestMonth = monthsWithData.length > 0 ? monthsWithData[0] : null;
      const currentMonthImported = monthsWithData.includes(currentMonth);

      // Monatliches Soll
      const totalRent = paying.reduce((s, t) => s + (t.rent_total || 0), 0);

      // === Status für den letzten importierten Monat ===
      const relevantMonth = latestMonth;
      let paid = 0;
      let openCount = 0;
      let unclear = 0;
      let paidMonth = 0;

      if (relevantMonth) {
        paying.forEach((tenant) => {
          // Bei WGs: auch Zahlungen der Mitglieder mitzählen
          const wgMemberIds = active
            .filter((m) => m.wg_main_tenant_id === tenant.id)
            .map((m) => m.id);
          const allTenantIds = [tenant.id, ...wgMemberIds];

          const tenantTx = txForObj.filter(
            (t) => allTenantIds.includes(t.tenant_id || "") && t.month_period === relevantMonth
          );
          const tenantPaid = tenantTx.reduce((s, t) => s + t.amount, 0);
          paidMonth += tenantPaid;

          const hasUnclear = tenantTx.some((t) => t.status === "unclear");

          if (tenantPaid >= tenant.rent_total) {
            paid++;
          } else if (hasUnclear) {
            unclear++;
          } else {
            openCount++;
          }
        });
      }

      // === Kumulierter Saldo + Zahlungsquote NUR über importierte Monate ===
      let saldoCumulative = 0;
      let totalSollAllMonths = 0;
      let totalIstAllMonths = 0;

      if (monthsWithData.length > 0) {
        monthsWithData.forEach((month) => {
          let monthSoll = 0;
          let monthIst = 0;

          paying.forEach((tenant) => {
            // Nur mitzählen wenn Mieter schon eingezogen war
            if (tenant.move_in_date) {
              const moveInMonth = tenant.move_in_date.substring(0, 7);
              if (month < moveInMonth) return;
            }
            monthSoll += tenant.rent_total;

            const wgMemberIds = active
              .filter((m) => m.wg_main_tenant_id === tenant.id)
              .map((m) => m.id);
            const allTenantIds = [tenant.id, ...wgMemberIds];

            const tenantTx = txForObj.filter(
              (t) => allTenantIds.includes(t.tenant_id || "") && t.month_period === month
            );
            monthIst += tenantTx.reduce((s, t) => s + t.amount, 0);
          });

          saldoCumulative += (monthIst - monthSoll);
          totalSollAllMonths += monthSoll;
          totalIstAllMonths += monthIst;
        });
      }

      // Zahlungsquote: nur basierend auf importierten Monaten
      const paymentRate = totalSollAllMonths > 0 ? Math.round((totalIstAllMonths / totalSollAllMonths) * 100) : 0;

      // === Befristungs-Warnungen ===
      const today = new Date();
      const threeMonths = new Date(today);
      threeMonths.setMonth(threeMonths.getMonth() + 3);
      const leaseWarnings = active.filter((t) => {
        if (!t.lease_end) return false;
        const end = new Date(t.lease_end);
        return end >= today && end <= threeMonths;
      }).length;

      stats.set(obj.id, {
        units: active.length,
        activeTenants: paying.length,
        vacancy,
        totalRent,
        paidMonth,
        paid,
        open: openCount,
        unclear,
        saldoMonth: paidMonth - totalRent,
        saldoCumulative,
        paymentRate,
        latestMonth,
        earliestMonth,
        currentMonthImported,
        leaseWarnings,
      });
    });

    return stats;
  }, [objects, allTenants, allTransactions, currentMonth]);

  // === Globale KPIs ===
  const globalStats = useMemo(() => {
    let totalUnits = 0;
    let totalRent = 0;
    let totalPaid = 0;
    let totalOpen = 0;
    let totalVacancy = 0;
    let totalWarnings = 0;
    let missingImports = 0;
    let globalEarliestMonth: string | null = null;

    objectStats.forEach((s) => {
      totalUnits += s.units;
      totalRent += s.totalRent;
      totalPaid += s.paidMonth;
      totalOpen += s.open;
      totalVacancy += s.vacancy;
      totalWarnings += s.leaseWarnings;
      if (!s.currentMonthImported && s.activeTenants > 0) missingImports++;
      if (s.earliestMonth && (!globalEarliestMonth || s.earliestMonth < globalEarliestMonth)) {
        globalEarliestMonth = s.earliestMonth;
      }
    });

    // Zahlungsquote: gewichteter Durchschnitt der Objekt-Quoten (basierend auf importierten Monaten)
    let weightedRateSum = 0;
    let weightSum = 0;
    objectStats.forEach((s) => {
      if (s.latestMonth && s.totalRent > 0) {
        weightedRateSum += s.paymentRate * s.totalRent;
        weightSum += s.totalRent;
      }
    });
    const paymentRate = weightSum > 0 ? Math.round(weightedRateSum / weightSum) : 0;

    // Offener Betrag: nur für den letzten importierten Monat (nicht für nicht-importierte)
    const openAmount = totalRent > 0 && totalPaid > 0 ? Math.max(0, totalRent - totalPaid) : 0;
    const vacancyRate = totalUnits > 0 ? Math.round((totalVacancy / totalUnits) * 100) : 0;

    return { totalUnits, totalRent, totalPaid, totalOpen, totalVacancy, totalWarnings, missingImports, paymentRate, openAmount, vacancyRate, globalEarliestMonth };
  }, [objectStats]);

  // === Nächste Aktionen ===
  const nextActions = useMemo(() => {
    const actions: { icon: string; text: string; color: string }[] = [];
    if (globalStats.missingImports > 0) {
      actions.push({
        icon: "🏦",
        text: globalStats.missingImports === 1
          ? `1 Kontoauszug für ${formatMonth(currentMonth)} fehlt noch`
          : `${globalStats.missingImports} Kontoauszüge für ${formatMonth(currentMonth)} fehlen noch`,
        color: "text-blue-700 bg-blue-50 border-blue-200",
      });
    }
    if (globalStats.totalOpen > 0) {
      actions.push({
        icon: "⚠️",
        text: `${globalStats.totalOpen} Mieter mit Rückstand – Mahnung prüfen`,
        color: "text-red-700 bg-red-50 border-red-200",
      });
    }
    if (globalStats.totalWarnings > 0) {
      actions.push({
        icon: "⏰",
        text: globalStats.totalWarnings === 1
          ? "1 Befristung läuft in den nächsten 3 Monaten aus"
          : `${globalStats.totalWarnings} Befristungen laufen in den nächsten 3 Monaten aus`,
        color: "text-amber-700 bg-amber-50 border-amber-200",
      });
    }
    return actions;
  }, [globalStats, currentMonth]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Vermieter-Assistent</h1>
            <p className="text-sm text-gray-500 mt-0.5">Ihre Objekte im Überblick</p>
          </div>
          <button onClick={() => setShowModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            + Objekt anlegen
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        {/* === Globale KPIs – eine Karte mit internen Borders === */}
        <div className="bg-white rounded-xl border border-gray-200 mb-6 overflow-hidden">
          <div className="grid grid-cols-3 sm:grid-cols-6 divide-x divide-gray-200">
            <div className="px-4 py-3">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider">Objekte</span>
              <p className="text-xl font-bold text-gray-900 mt-0.5">{objects.length}</p>
            </div>
            <div className="px-4 py-3">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider">Einheiten</span>
              <p className="text-xl font-bold text-gray-900 mt-0.5">{globalStats.totalUnits}</p>
            </div>
            <div className="px-4 py-3">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider">Mietsoll</span>
              <p className="text-xl font-bold text-gray-900 mt-0.5">{globalStats.totalRent.toLocaleString("de-DE", { maximumFractionDigits: 0 })} €</p>
            </div>
            <div className="px-4 py-3">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider">Zahlungsquote</span>
              <div className="flex items-center gap-2 mt-0.5">
                <p className={`text-xl font-bold ${globalStats.paymentRate >= 90 ? "text-emerald-600" : globalStats.paymentRate >= 70 ? "text-amber-600" : "text-red-600"}`}>
                  {globalStats.paymentRate}%
                </p>
                <div className="flex-1 max-w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${globalStats.paymentRate >= 90 ? "bg-emerald-500" : globalStats.paymentRate >= 70 ? "bg-amber-500" : "bg-red-500"}`}
                    style={{ width: `${Math.min(100, globalStats.paymentRate)}%` }} />
                </div>
              </div>
              {globalStats.globalEarliestMonth && <span className="text-[9px] text-gray-400">seit {formatMonth(globalStats.globalEarliestMonth)}</span>}
            </div>
            <div className="px-4 py-3">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider">Offen</span>
              <p className={`text-xl font-bold mt-0.5 ${globalStats.openAmount > 0 ? "text-red-600" : "text-emerald-600"}`}>
                {globalStats.openAmount > 0 ? globalStats.openAmount.toLocaleString("de-DE", { maximumFractionDigits: 0 }) + " €" : "0 €"}
              </p>
            </div>
            <div className="px-4 py-3">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider">Leerstand</span>
              <p className={`text-xl font-bold mt-0.5 ${globalStats.totalVacancy > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                {globalStats.totalVacancy} / {globalStats.totalUnits}
              </p>
            </div>
          </div>
        </div>

        {/* === Nächste Aktionen === */}
        {nextActions.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            {nextActions.map((action, i) => (
              <div key={i} className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium ${action.color}`}>
                <span>{action.icon}</span>
                <span>{action.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-12 text-gray-500">Objekte werden geladen...</div>
        )}

        {/* Leerer Zustand */}
        {!loading && objects.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🏠</div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Noch keine Objekte angelegt</h2>
            <p className="text-gray-500 mb-6">Legen Sie Ihr erstes Mietobjekt an, um loszulegen.</p>
            <button onClick={() => setShowModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors">
              + Erstes Objekt anlegen
            </button>
          </div>
        )}

        {/* === Objekt-Karten === */}
        {!loading && objects.length > 0 && (
          <div className="grid gap-5">
            {objects.map((obj) => {
              const s = objectStats.get(obj.id);
              if (!s) return null;
              const hasData = s.latestMonth !== null;

              return (
                <div key={obj.id} onClick={() => router.push(`/object/${obj.id}`)}
                  className="bg-white rounded-2xl border border-gray-200 p-5 hover:border-blue-300 hover:shadow-lg transition-all cursor-pointer group">

                  {/* Kopfzeile: Icon + Name + Pfeil */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-lg shrink-0 group-hover:bg-blue-100 transition-colors">🏠</div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg font-semibold text-gray-900">{obj.name}</h2>
                          {s.leaseWarnings > 0 && (
                            <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full font-medium">⏰ {s.leaseWarnings}</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">{obj.address}{obj.iban && ` · IBAN: ...${obj.iban.slice(-4)}`}</p>
                      </div>
                    </div>
                    <svg className="w-5 h-5 text-gray-300 group-hover:text-blue-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>

                  {/* KPI-Grid – 4 Zellen mit Innenborders */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-gray-200 border border-gray-200 rounded-xl overflow-hidden">

                    {/* Einheiten & Leerstand */}
                    <div className="px-3.5 py-3 bg-gray-50/50">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider">Leerstand / Einheiten</span>
                      <p className="text-base font-bold text-gray-900 mt-0.5">{s.vacancy} / {s.units}</p>
                      <span className="text-[10px] text-gray-400">{s.activeTenants} zahlende Mieter</span>
                    </div>

                    {/* Soll vs. Ist letzter Monat */}
                    <div className="px-3.5 py-3 bg-gray-50/50">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider">Ist / Soll {hasData ? formatMonth(s.latestMonth!) : ""}</span>
                      {hasData ? (
                        <div className="mt-0.5">
                          <p className="text-base font-bold text-gray-900">
                            {s.paidMonth.toLocaleString("de-DE", { maximumFractionDigits: 0 })} € / {s.totalRent.toLocaleString("de-DE", { maximumFractionDigits: 0 })} €
                          </p>
                          <span className={`text-[10px] font-medium ${s.saldoMonth >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {s.saldoMonth >= 0 ? "+" : ""}{s.saldoMonth.toLocaleString("de-DE", { maximumFractionDigits: 0 })} € Differenz
                          </span>
                        </div>
                      ) : (
                        <p className="text-base font-bold text-gray-900 mt-0.5">{s.totalRent.toLocaleString("de-DE", { maximumFractionDigits: 0 })} € / –</p>
                      )}
                    </div>

                    {/* Saldo kumuliert */}
                    <div className="px-3.5 py-3 bg-gray-50/50">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider">Saldo kumuliert</span>
                      {hasData ? (
                        <>
                          <p className={`text-base font-bold mt-0.5 ${s.saldoCumulative >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {s.saldoCumulative >= 0 ? "+" : ""}{s.saldoCumulative.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                          </p>
                          <span className="text-[10px] text-gray-400">seit {formatMonth(s.earliestMonth!)}</span>
                        </>
                      ) : (
                        <p className="text-base font-bold text-gray-300 mt-0.5">–</p>
                      )}
                    </div>

                    {/* Zahlungsstatus – beschreibend */}
                    <div className="px-3.5 py-3 bg-gray-50/50">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider">Zahlungsstatus</span>
                      {hasData ? (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {s.paid > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{s.paid} bezahlt
                            </span>
                          )}
                          {s.open > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-700 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />{s.open} offen
                            </span>
                          )}
                          {s.unclear > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{s.unclear} unklar
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="text-[11px] text-gray-400 mt-1.5">Kein Import</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <CreateObjectModal isOpen={showModal} onClose={() => setShowModal(false)} onCreated={loadData} />
    </div>
  );
}
