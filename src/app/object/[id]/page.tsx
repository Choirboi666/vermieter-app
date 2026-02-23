"use client";

import { useState, useEffect, use, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import ExcelImportModal from "@/components/ExcelImportModal";
import BankImportModal from "@/components/BankImportModal";
import {
  calcTenantSaldo,
  calcMemberPayments,
  getCurrentMonth,
  getPreviousMonth,
  formatMonth,
  formatMonthLong,
  type Transaction,
  type TenantSaldo,
} from "@/lib/saldo";

interface ObjectData {
  id: string;
  name: string;
  address: string;
  iban: string | null;
  bic: string | null;
  account_holder: string | null;
}

interface Tenant {
  id: string;
  number: string | null;
  name: string;
  unit_label: string;
  rent_total: number;
  is_active: boolean;
  area_sqm: number | null;
  rent_cold: number | null;
  utilities_cold: number | null;
  heating_costs: number | null;
  vat: number | null;
  move_in_date: string | null;
  lease_end: string | null;
  is_commercial: boolean;
  wg_type: string | null;
  notes: string | null;
}

// Betrag farbig anzeigen: grün wenn >= soll, rot wenn darunter
function MonthAmountCell({ saldo, monthKey, rentTotal, tenantId, objectId, onManualEntry, unmatchedTx, wgMembers }: {
  saldo: TenantSaldo | undefined; monthKey: string; rentTotal: number; tenantId: string; objectId: string; onManualEntry: () => void;
  unmatchedTx: Transaction[]; wgMembers?: { id: string; name: string }[];
}) {
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set());
  const [targetMemberId, setTargetMemberId] = useState<string>(tenantId);

  if (!saldo) return <span className="text-xs text-gray-400">{"\u2013"}</span>;
  const ms = saldo.months.find((m) => m.month === monthKey);
  if (!ms) return <span className="text-xs text-gray-400">{"\u2013"}</span>;
  const val = ms.covered;
  const isOk = val >= rentTotal;
  const isPartial = val > 0 && val < rentTotal;

  const handleSaveManual = async () => {
    const amount = parseFloat(inputVal.replace(",", "."));
    if (isNaN(amount) || amount <= 0) { setEditing(false); return; }
    setSaving(true);
    await supabase.from("transactions").insert({
      object_id: objectId, tenant_id: tenantId, date: `${monthKey}-15`,
      amount, purpose_raw: "Manuelle Eingabe", confidence: 1,
      match_reason: "Manuell eingetragen", status: "matched", month_period: monthKey,
    });
    setSaving(false); setEditing(false); setInputVal(""); onManualEntry();
  };

  const handleAssign = async () => {
    if (selectedTxIds.size === 0) return;
    setSaving(true);
    for (const txId of selectedTxIds) {
      await supabase.from("transactions").update({
        tenant_id: targetMemberId, status: "matched",
        match_reason: "Manuell zugeordnet", confidence: 1,
      }).eq("id", txId);
    }
    setSaving(false); setAssigning(false); setSelectedTxIds(new Set()); setTargetMemberId(tenantId); onManualEntry();
  };

  const toggleTx = (txId: string) => {
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      if (next.has(txId)) next.delete(txId); else next.add(txId);
      return next;
    });
  };

  if (editing) {
    return (
      <input type="text" autoFocus value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleSaveManual(); if (e.key === "Escape") { setEditing(false); setInputVal(""); } }}
        onBlur={() => { if (!saving) { setEditing(false); setInputVal(""); } }}
        placeholder={rentTotal.toFixed(2)}
        className="w-24 px-2 py-1 text-sm text-right border border-blue-400 rounded focus:ring-2 focus:ring-blue-500 outline-none"
      />
    );
  }

  if (assigning) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setAssigning(false); setSelectedTxIds(new Set()); setTargetMemberId(tenantId); }}>
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="p-5 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-900">Zahlung zuordnen</h3>
            <p className="text-sm text-gray-500 mt-1">Nicht zugeordnete Zahlungen der letzten 4 Monate</p>
          </div>
          <div className="p-5">
            {unmatchedTx.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-6">Keine nicht-zugeordneten Zahlungen vorhanden.</p>
            ) : (
              <div className="space-y-2">
                {unmatchedTx.map((tx) => (
                  <label key={tx.id} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${selectedTxIds.has(tx.id) ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:bg-gray-50"}`}>
                    <input type="checkbox" checked={selectedTxIds.has(tx.id)} onChange={() => toggleTx(tx.id)}
                      className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{tx.amount.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</span>
                        <span className="text-xs text-gray-500">{tx.date}</span>
                      </div>
                      <p className="text-xs text-gray-600 truncate mt-0.5">{tx.purpose_raw}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
            {wgMembers && wgMembers.length > 1 && selectedTxIds.size > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-sm font-medium text-gray-700 mb-2">Zuordnen an:</p>
                <div className="space-y-1.5">
                  {wgMembers.map((m) => (
                    <label key={m.id} className={`flex items-center gap-2 p-2 border rounded-lg cursor-pointer transition-colors ${targetMemberId === m.id ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:bg-gray-50"}`}>
                      <input type="radio" name="wgTarget" checked={targetMemberId === m.id} onChange={() => setTargetMemberId(m.id)}
                        className="text-blue-600 focus:ring-blue-500" />
                      <span className="text-sm text-gray-900">{m.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="p-5 border-t border-gray-100 flex gap-3 justify-end">
            <button onClick={() => { setAssigning(false); setSelectedTxIds(new Set()); setTargetMemberId(tenantId); }}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Abbrechen</button>
            <button onClick={handleAssign} disabled={selectedTxIds.size === 0 || saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50">
              {saving ? "Speichere..." : `${selectedTxIds.size} Zahlung${selectedTxIds.size !== 1 ? "en" : ""} zuordnen`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative inline-flex items-center gap-1" onMouseEnter={() => setHover(true)} onMouseLeave={() => { setHover(false); setMenuOpen(false); }}>
      <span className={`text-sm font-medium ${isOk ? "text-emerald-600" : isPartial ? "text-red-500" : "text-red-600"}`}>
        {val.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
      </span>
      {hover && (
        <div className="relative">
          <button onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Zahlung bearbeiten">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-6 bg-white border border-gray-200 rounded-lg shadow-lg z-40 py-1 w-48">
              <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setEditing(true); }}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                Manuell eingeben
              </button>
              <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setAssigning(true); }}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75L17.25 9m0 0L21 12.75M17.25 9v12" /></svg>
                Zahlung zuordnen
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Kompakte Zelle für WG-Mitglieder ohne Soll – zeigt Betrag in grau + Zuordnungs-Option
function WgSubAmountCell({ amount, tenantId, objectId, onManualEntry, unmatchedTx, wgMembers }: {
  amount?: number; tenantId: string; objectId: string; onManualEntry: () => void;
  unmatchedTx: Transaction[]; wgMembers?: { id: string; name: string }[];
}) {
  const [hover, setHover] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set());
  const [targetMemberId, setTargetMemberId] = useState<string>(tenantId);

  const toggleTx = (txId: string) => {
    setSelectedTxIds((prev) => { const n = new Set(prev); if (n.has(txId)) n.delete(txId); else n.add(txId); return n; });
  };
  const handleAssign = async () => {
    if (selectedTxIds.size === 0) return;
    setSaving(true);
    for (const txId of selectedTxIds) {
      await supabase.from("transactions").update({ tenant_id: targetMemberId, status: "matched", match_reason: "Manuell zugeordnet", confidence: 1 }).eq("id", txId);
    }
    setSaving(false); setAssigning(false); setSelectedTxIds(new Set()); setTargetMemberId(tenantId); onManualEntry();
  };

  if (assigning) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setAssigning(false); setSelectedTxIds(new Set()); }}>
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="p-5 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-900">Zahlung zuordnen</h3>
            <p className="text-sm text-gray-500 mt-1">Nicht zugeordnete Zahlungen der letzten 4 Monate</p>
          </div>
          <div className="p-5">
            {unmatchedTx.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-6">Keine nicht-zugeordneten Zahlungen vorhanden.</p>
            ) : (<div className="space-y-2">{unmatchedTx.map((tx) => (
              <label key={tx.id} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${selectedTxIds.has(tx.id) ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:bg-gray-50"}`}>
                <input type="checkbox" checked={selectedTxIds.has(tx.id)} onChange={() => toggleTx(tx.id)} className="mt-0.5 rounded border-gray-300 text-blue-600" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><span className="text-sm font-semibold text-gray-900">{tx.amount.toLocaleString("de-DE",{style:"currency",currency:"EUR"})}</span><span className="text-xs text-gray-500">{tx.date}</span></div>
                  <p className="text-xs text-gray-600 truncate mt-0.5">{tx.purpose_raw}</p>
                </div>
              </label>
            ))}</div>)}
            {wgMembers && wgMembers.length > 1 && selectedTxIds.size > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-sm font-medium text-gray-700 mb-2">Zuordnen an:</p>
                <div className="space-y-1.5">{wgMembers.map((m) => (
                  <label key={m.id} className={`flex items-center gap-2 p-2 border rounded-lg cursor-pointer transition-colors ${targetMemberId === m.id ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:bg-gray-50"}`}>
                    <input type="radio" name="wgTargetSub" checked={targetMemberId === m.id} onChange={() => setTargetMemberId(m.id)} className="text-blue-600" />
                    <span className="text-sm text-gray-900">{m.name}</span>
                  </label>
                ))}</div>
              </div>
            )}
          </div>
          <div className="p-5 border-t border-gray-100 flex gap-3 justify-end">
            <button onClick={() => { setAssigning(false); setSelectedTxIds(new Set()); }} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Abbrechen</button>
            <button onClick={handleAssign} disabled={selectedTxIds.size === 0 || saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
              {saving ? "Speichere..." : `${selectedTxIds.size} Zahlung${selectedTxIds.size !== 1 ? "en" : ""} zuordnen`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative inline-flex items-center gap-1" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <span className="text-sm text-gray-400">{amount ? amount.toLocaleString("de-DE",{style:"currency",currency:"EUR"}) : "\u2013"}</span>
      {hover && (
        <button onClick={(e) => { e.stopPropagation(); setAssigning(true); }}
          className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Zahlung zuordnen">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M9 12l3 3m0 0l3-3m-3 3V2.25" /></svg>
        </button>
      )}
    </div>
  );
}



function SaldoBadge({ saldo }: { saldo: number }) {
  if (Math.abs(saldo) < 0.01) return <span className="text-xs text-gray-400">0</span>;
  const formatted = Math.abs(saldo).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  if (saldo > 0) return <span className="text-xs text-emerald-600 font-medium">+{formatted}</span>;
  return <span className="text-xs text-red-600 font-medium">-{formatted}</span>;
}

function TenantDetailModal({ tenant, saldo, isOpen, onClose }: { tenant: Tenant | null; saldo: TenantSaldo | null; isOpen: boolean; onClose: () => void; }) {
  if (!isOpen || !tenant || !saldo) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{tenant.name}</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {tenant.unit_label}
                {tenant.wg_type && <span className="ml-2 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">WG-{tenant.wg_type}</span>}
                {tenant.is_commercial && <span className="ml-2 text-xs font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">Gewerbe</span>}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
        <div className="p-6 border-b border-gray-100">
          <div className="grid grid-cols-3 gap-4">
            <div><p className="text-xs text-gray-500 uppercase tracking-wide">Soll/Monat</p><p className="text-lg font-bold text-gray-900 mt-0.5">{tenant.rent_total.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</p></div>
            <div><p className="text-xs text-gray-500 uppercase tracking-wide">Einzug</p><p className="text-sm font-medium text-gray-900 mt-1">{tenant.move_in_date || "–"}</p></div>
            <div><p className="text-xs text-gray-500 uppercase tracking-wide">Befristung</p><p className="text-sm font-medium text-gray-900 mt-1">{tenant.lease_end || "–"}</p></div>
          </div>
          {tenant.notes && <div className="mt-3 p-2 bg-gray-50 rounded-lg"><p className="text-xs text-gray-500">💬 {tenant.notes}</p></div>}
        </div>
        <div className="p-6 border-b border-gray-100">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3"><p className="text-xs text-gray-500">Gesamt Soll</p><p className="text-lg font-bold text-gray-800">{saldo.totalSoll.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</p></div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3"><p className="text-xs text-emerald-600">Gesamt bezahlt</p><p className="text-lg font-bold text-emerald-800">{saldo.totalPaid.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</p></div>
            <div className={`border rounded-lg p-3 ${saldo.saldoExcludingCurrent >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
              <p className={`text-xs ${saldo.saldoExcludingCurrent >= 0 ? "text-emerald-600" : "text-red-600"}`}>Saldo (abgeschl.)</p>
              <p className={`text-lg font-bold ${saldo.saldoExcludingCurrent >= 0 ? "text-emerald-800" : "text-red-800"}`}>{saldo.saldoExcludingCurrent.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Monatliche Aufstellung</h3>
          {saldo.months.length === 0 ? (
            <div className="text-center py-8"><p className="text-sm text-gray-500">Noch keine Daten vorhanden.</p></div>
          ) : (
            <div className="space-y-2">
              {[...saldo.months].reverse().map((ms) => {
                const isCurrent = ms.month === getCurrentMonth();
                return (
                  <div key={ms.month} className={`border rounded-lg p-3 ${isCurrent ? "border-blue-200 bg-blue-50/30" : ms.status === "paid" ? "border-emerald-200 bg-emerald-50/30" : ms.status === "partial" ? "border-amber-200 bg-amber-50/30" : "border-red-200 bg-red-50/30"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{formatMonth(ms.month)}</span>
                        {isCurrent && <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">Laufend</span>}
                        {!isCurrent && ms.status === "paid" && <span className="text-xs text-emerald-600">✓ Bezahlt</span>}
                        {!isCurrent && ms.status === "partial" && <span className="text-xs text-amber-600">Teilweise ({ms.covered.toLocaleString("de-DE", { style: "currency", currency: "EUR" })} von {ms.soll.toLocaleString("de-DE", { style: "currency", currency: "EUR" })})</span>}
                        {!isCurrent && ms.status === "open" && <span className="text-xs text-red-600">Offen</span>}
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{ms.soll.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</span>
                    </div>
                    {ms.payments.length > 0 && (
                      <div className="mt-1">
                        {ms.payments.map((p) => (
                          <div key={p.id} className="flex items-center justify-between text-xs text-gray-500 mt-1 pl-2 border-l-2 border-gray-200">
                            <span className="truncate mr-2">💳 {p.date} · {p.purpose_raw.substring(0, 55)}{p.purpose_raw.length > 55 ? "…" : ""}</span>
                            <span className="flex-shrink-0 font-medium text-emerald-600">+{p.amount.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg"><p className="text-xs text-blue-700">ℹ️ Zahlungen werden gemäß §366 BGB auf die älteste offene Forderung angerechnet.</p></div>
        </div>
        <div className="p-6 border-t border-gray-100 flex justify-end"><button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Schließen</button></div>
      </div>
    </div>
  );
}

function AddTenantModal({ isOpen, onClose, onCreated, objectId }: { isOpen: boolean; onClose: () => void; onCreated: () => void; objectId: string; }) {
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [unitLabel, setUnitLabel] = useState("");
  const [areaSqm, setAreaSqm] = useState("");
  const [rentCold, setRentCold] = useState("");
  const [utilitiesCold, setUtilitiesCold] = useState("");
  const [heatingCosts, setHeatingCosts] = useState("");
  const [vat, setVat] = useState("");
  const [rentTotal, setRentTotal] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = (parseFloat(rentCold) || 0) + (parseFloat(utilitiesCold) || 0) + (parseFloat(heatingCosts) || 0) + (parseFloat(vat) || 0);
    if (t > 0) setRentTotal(t.toFixed(2));
  }, [rentCold, utilitiesCold, heatingCosts, vat]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!name.trim() || !unitLabel.trim() || !rentTotal) return;
    setSaving(true);
    const { error } = await supabase.from("tenants").insert({
      object_id: objectId, number: number.trim() || null, name: name.trim(), unit_label: unitLabel.trim(),
      area_sqm: areaSqm ? parseFloat(areaSqm) : null, rent_cold: rentCold ? parseFloat(rentCold) : null,
      utilities_cold: utilitiesCold ? parseFloat(utilitiesCold) : null, heating_costs: heatingCosts ? parseFloat(heatingCosts) : null,
      vat: vat ? parseFloat(vat) : null, rent_total: parseFloat(rentTotal), is_active: true,
    });
    if (error) { alert("Fehler: " + error.message); }
    else { setNumber(""); setName(""); setUnitLabel(""); setAreaSqm(""); setRentCold(""); setUtilitiesCold(""); setHeatingCosts(""); setVat(""); setRentTotal(""); onCreated(); onClose(); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100"><h2 className="text-lg font-semibold text-gray-900">Neuen Mieter anlegen</h2></div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Nummer</label><input type="text" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="z.B. M001" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Name *</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Müller" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Wohnung *</label><input type="text" value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)} placeholder="z.B. VH 3. OG rechts" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Fläche (m²)</label><input type="number" value={areaSqm} onChange={(e) => setAreaSqm(e.target.value)} placeholder="z.B. 65" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" /></div>
          </div>
          <hr className="border-gray-200" />
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Mietzusammensetzung</p>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Kaltmiete (€)</label><input type="number" step="0.01" value={rentCold} onChange={(e) => setRentCold(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Kalte BK (€)</label><input type="number" step="0.01" value={utilitiesCold} onChange={(e) => setUtilitiesCold(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Heizkosten (€)</label><input type="number" step="0.01" value={heatingCosts} onChange={(e) => setHeatingCosts(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">USt. (€)</label><input type="number" step="0.01" value={vat} onChange={(e) => setVat(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" /></div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <label className="block text-sm font-medium text-blue-800 mb-1">Bruttogesamtmiete (€) *</label>
            <input type="number" step="0.01" value={rentTotal} onChange={(e) => setRentTotal(e.target.value)} className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm font-semibold text-blue-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
        </div>
        <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Abbrechen</button>
          <button onClick={handleSave} disabled={!name.trim() || !unitLabel.trim() || !rentTotal || saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50">{saving ? "Speichern..." : "Mieter anlegen"}</button>
        </div>
      </div>
    </div>
  );
}

export default function ObjectDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [object, setObject] = useState<ObjectData | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddTenant, setShowAddTenant] = useState(false);
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [showBankImport, setShowBankImport] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [activeTab, setActiveTab] = useState<"active" | "former">("active");

  const loadData = async () => {
    const { data: objData } = await supabase.from("objects").select("*").eq("id", id).single();
    if (objData) setObject(objData);
    const { data: tenantData } = await supabase.from("tenants").select("*").eq("object_id", id).order("unit_label", { ascending: true });
    if (tenantData) setTenants(tenantData);
    const { data: txData } = await supabase.from("transactions").select("*").eq("object_id", id).order("date", { ascending: false });
    if (txData) setTransactions(txData);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [id]);

  const activeTenants = tenants.filter((t) => t.is_active);
  const formerTenants = tenants.filter((t) => !t.is_active);
  const payingTenants = activeTenants.filter((t) => t.rent_total > 0 && t.name.toLowerCase() !== "leerstand");
  const leerstand = activeTenants.filter((t) => t.name.toLowerCase() === "leerstand");
  const totalRentExpected = payingTenants.reduce((sum, t) => sum + (t.rent_total || 0), 0);

  const currentMonth = getCurrentMonth();
  const prevMonth = getPreviousMonth();

  const earliestDataMonth = useMemo(() => {
    if (transactions.length === 0) return undefined;
    const months = transactions.filter((t) => t.tenant_id).map((t) => t.date.substring(0, 7));
    return months.length > 0 ? months.sort()[0] : undefined;
  }, [transactions]);

  const latestDataMonth = useMemo(() => {
    if (transactions.length === 0) return undefined;
    const months = transactions.filter((t) => t.tenant_id).map((t) => t.date.substring(0, 7));
    return months.length > 0 ? months.sort().reverse()[0] : undefined;
  }, [transactions]);

  const currentMonthImported = latestDataMonth === currentMonth;

  // WG-Gruppen ermitteln (Typ B/C: gleiche unit_label, wg_type B oder C)
  const wgGroups = useMemo(() => {
    const groups = new Map<string, Tenant[]>(); // unit_label → Mitglieder
    activeTenants.forEach((t) => {
      if (t.wg_type === "B" || t.wg_type === "C" ||
          t.wg_type === "B - Ein Vertrag einer zahlt" ||
          t.wg_type === "C - Ein Vertrag jeder zahlt Anteil") {
        const key = t.unit_label;
        const existing = groups.get(key) || [];
        existing.push(t);
        groups.set(key, existing);
      }
    });
    return groups;
  }, [activeTenants]);

  // Individuelle Zahlungen pro WG-Mitglied (für hellgraue Anzeige)
  const memberPayments = useMemo(() => {
    const map = new Map<string, Map<string, number>>(); // tenant_id → (month → amount)
    // Berechne individuelle Zahlungen für ALLE WG-Mitglieder (B/C), nicht nur Subs
    activeTenants.forEach((t) => {
      if (t.wg_type === "B" || t.wg_type === "C" ||
          t.wg_type === "B - Ein Vertrag einer zahlt" ||
          t.wg_type === "C - Ein Vertrag jeder zahlt Anteil") {
        map.set(t.id, calcMemberPayments(t.id, transactions));
      }
    });
    return map;
  }, [activeTenants, transactions]);

  const tenantSaldos = useMemo(() => {
    const map = new Map<string, TenantSaldo>();
    activeTenants.forEach((t) => {
      if (t.rent_total > 0 && t.name.toLowerCase() !== "leerstand") {
        // Bei WG Typ B/C: alle Mitglieder-IDs sammeln
        const wgMembers = wgGroups.get(t.unit_label);
        const wgMemberIds = wgMembers ? wgMembers.map((m) => m.id) : undefined;
        map.set(t.id, calcTenantSaldo(t.id, t.rent_total, t.move_in_date, transactions, earliestDataMonth, latestDataMonth, wgMemberIds));
      }
    });
    return map;
  }, [activeTenants, transactions, earliestDataMonth, latestDataMonth, wgGroups]);

  // Summen für Karten
  const prevMonthPaidTotal = Array.from(tenantSaldos.values()).reduce((sum, s) => {
    const ms = s.months.find((m) => m.month === prevMonth);
    return sum + (ms?.covered || 0);
  }, 0);

  const currentMonthPaidTotal = Array.from(tenantSaldos.values()).reduce((sum, s) => {
    const ms = s.months.find((m) => m.month === currentMonth);
    return sum + (ms?.covered || 0);
  }, 0);

  const totalSaldoClosed = Array.from(tenantSaldos.values()).reduce((sum, s) => sum + s.saldoExcludingCurrent, 0);

  // Nicht zugeordnete Transaktionen der letzten 4 Monate (für "Zahlung zuordnen" Modal)
  const unmatchedTx = useMemo(() => {
    const fourMonthsAgo = getPreviousMonth(getPreviousMonth(getPreviousMonth(prevMonth)));
    return transactions
      .filter((t) => !t.tenant_id && t.date >= fourMonthsAgo && t.amount > 0)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, prevMonth]);

  const leaseWarnings = useMemo(() => {
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() + 3);
    const cutoffStr = cutoff.toISOString().substring(0, 10);
    const today = new Date().toISOString().substring(0, 10);
    return activeTenants.filter((t) => t.lease_end && t.lease_end !== "unbefristet" && t.lease_end >= today && t.lease_end <= cutoffStr);
  }, [activeTenants]);

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-500">Wird geladen...</p></div>;
  if (!object) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-500">Objekt nicht gefunden</p></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-400 hover:text-gray-600 transition-colors"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg></Link>
            <div><h1 className="text-xl font-bold text-gray-900">{object.name}</h1><p className="text-sm text-gray-500">{object.address}</p></div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Karten-Reihe: 3 Monatskarten + Leerstand */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1 grid grid-cols-3 gap-4">
            {/* Karte 1: Letzter Monat */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-semibold text-gray-900">{formatMonthLong(prevMonth)}</h3><span className="text-xs text-gray-400">Abgeschlossen</span></div>
              {!earliestDataMonth || prevMonth < earliestDataMonth ? <p className="text-sm text-gray-400">Keine Daten</p> : (<>
                <p className="text-xs text-gray-500 mb-0.5">Soll: {totalRentExpected.toLocaleString("de-DE",{style:"currency",currency:"EUR"})}</p>
                <p className={`text-2xl font-bold ${prevMonthPaidTotal >= totalRentExpected ? "text-emerald-600" : "text-red-600"}`}>{prevMonthPaidTotal.toLocaleString("de-DE",{style:"currency",currency:"EUR"})}</p>
                <p className="text-xs text-gray-400 mt-1">Ist-Eingang</p>
              </>)}
            </div>
            {/* Karte 2: Aktueller Monat */}
            <div className="bg-white rounded-xl border border-blue-200 p-5">
              <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-semibold text-gray-900">{formatMonthLong(currentMonth)}</h3><span className="text-xs text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">Laufend</span></div>
              {currentMonthImported ? (<>
                <p className="text-xs text-gray-500 mb-0.5">Soll: {totalRentExpected.toLocaleString("de-DE",{style:"currency",currency:"EUR"})}</p>
                <p className={`text-2xl font-bold ${currentMonthPaidTotal >= totalRentExpected ? "text-emerald-600" : "text-gray-900"}`}>{currentMonthPaidTotal.toLocaleString("de-DE",{style:"currency",currency:"EUR"})}</p>
                <p className="text-xs text-gray-400 mt-1">Ist-Eingang</p>
              </>) : (
                <div className="flex items-center gap-2 mt-2"><span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"/><p className="text-sm text-gray-500">Kontoauszug noch nicht importiert</p></div>
              )}
            </div>
            {/* Karte 3: Kumuliertes Saldo */}
            <div className={`bg-white rounded-xl border p-5 ${totalSaldoClosed >= 0 ? "border-emerald-200" : "border-red-200"}`}>
              <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-semibold text-gray-900">Saldo kumuliert</h3><span className="text-xs text-gray-400">Abgeschl. Monate</span></div>
              <p className={`text-2xl font-bold ${totalSaldoClosed >= 0 ? "text-emerald-600" : "text-red-600"}`}>{totalSaldoClosed.toLocaleString("de-DE",{style:"currency",currency:"EUR"})}</p>
              <p className="text-xs text-gray-400 mt-1">{payingTenants.length} Mieter · ab {earliestDataMonth ? formatMonth(earliestDataMonth) : "–"}</p>
            </div>
          </div>
          {/* Leerstand-Sidebar */}
          {leerstand.length > 0 && (
            <div className="w-48 shrink-0 bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3"><h3 className="text-xs font-semibold text-gray-700">Leerstand</h3><span className="text-xs text-gray-400">{leerstand.length}</span></div>
              <div className="grid grid-cols-2 gap-1.5">{leerstand.map((t) => <span key={t.id} className="text-[10px] text-gray-500 border border-gray-200 rounded px-1.5 py-0.5 truncate" title={t.unit_label}>{t.unit_label}</span>)}</div>
            </div>
          )}
        </div>

        {/* Befristungs-Warnungen */}
        {leaseWarnings.length > 0 && (
          <div className="mb-6">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-amber-800 mb-2">⏰ Befristungen laufen aus</h3>
              <div className="space-y-1">{leaseWarnings.map((t) => <div key={t.id} className="flex justify-between text-sm"><span className="text-amber-900">{t.name} ({t.unit_label})</span><span className="text-amber-600 font-medium">{t.lease_end}</span></div>)}</div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 mb-6">
          <button onClick={() => setShowAddTenant(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">+ Mieter anlegen</button>
          <button onClick={() => setShowExcelImport(true)} className="bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 transition-colors">📄 Mieterliste importieren</button>
          <button onClick={() => setShowBankImport(true)} className="bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 transition-colors">🏦 Bankauszug importieren</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
          <button onClick={() => setActiveTab("active")} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === "active" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Aktive Mieter ({activeTenants.length})</button>
          <button onClick={() => setActiveTab("former")} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === "former" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Ehemalige ({formerTenants.length})</button>
        </div>

        {activeTab === "active" && activeTenants.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <div className="text-4xl mb-3">👤</div><h3 className="text-base font-semibold text-gray-900 mb-1">Noch keine Mieter</h3><p className="text-sm text-gray-500 mb-4">Importieren Sie eine Mieterliste oder legen Sie Mieter manuell an.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setShowExcelImport(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">📄 Excel importieren</button>
              <button onClick={() => setShowAddTenant(true)} className="bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 transition-colors">+ Mieter anlegen</button>
            </div>
          </div>
        )}

        {activeTab === "active" && activeTenants.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead><tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">Mieter</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">Wohnung</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">Soll</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">{formatMonth(prevMonth)}</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">{formatMonth(currentMonth)}</th>
              </tr></thead>
              <tbody>
                {activeTenants.map((tenant) => {
                  const saldo = tenantSaldos.get(tenant.id);
                  const isLeerstand = tenant.name.toLowerCase() === "leerstand";
                  const isWgSub = (tenant.wg_type === "B" || tenant.wg_type === "C" ||
                    tenant.wg_type === "B - Ein Vertrag einer zahlt" ||
                    tenant.wg_type === "C - Ein Vertrag jeder zahlt Anteil") &&
                    tenant.rent_total === 0;
                  const mPayments = memberPayments.get(tenant.id);
                  const wgMembers = wgGroups.get(tenant.unit_label)?.map((m) => ({ id: m.id, name: m.name }));
                  return (
                    <tr key={tenant.id} onClick={() => !isLeerstand && !isWgSub && tenant.rent_total > 0 && setSelectedTenant(tenant)} className={`border-b border-gray-50 transition-colors ${isLeerstand ? "bg-gray-50/50" : isWgSub ? "bg-blue-50/20" : "hover:bg-blue-50/50 cursor-pointer"}`}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {isLeerstand ? <span className="text-gray-400 italic">{tenant.name}</span> : isWgSub ? <span className="text-gray-400 italic pl-3">↳ {tenant.name}</span> : <>{tenant.name}{tenant.wg_type && <span className="ml-1.5 text-xs text-blue-500">WG-{tenant.wg_type?.charAt(0)}</span>}{tenant.is_commercial && <span className="ml-1.5 text-xs text-orange-500">Gew.</span>}</>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{tenant.unit_label}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">{tenant.rent_total > 0 ? tenant.rent_total.toLocaleString("de-DE",{style:"currency",currency:"EUR"}) : <span className="text-gray-400">{"\u2013"}</span>}</td>
                      {isWgSub ? (<>
                        <td className="px-4 py-3 text-right"><WgSubAmountCell amount={mPayments?.get(prevMonth)} tenantId={tenant.id} objectId={id} onManualEntry={loadData} unmatchedTx={unmatchedTx} wgMembers={wgMembers} /></td>
                        <td className="px-4 py-3 text-right"><WgSubAmountCell amount={mPayments?.get(currentMonth)} tenantId={tenant.id} objectId={id} onManualEntry={loadData} unmatchedTx={unmatchedTx} wgMembers={wgMembers} /></td>
                      </>) : (<>
                        <td className="px-4 py-3 text-right"><MonthAmountCell saldo={saldo} monthKey={prevMonth} rentTotal={tenant.rent_total} tenantId={tenant.id} objectId={id} onManualEntry={loadData} unmatchedTx={unmatchedTx} wgMembers={wgMembers} /></td>
                        <td className="px-4 py-3 text-right"><MonthAmountCell saldo={saldo} monthKey={currentMonth} rentTotal={tenant.rent_total} tenantId={tenant.id} objectId={id} onManualEntry={loadData} unmatchedTx={unmatchedTx} wgMembers={wgMembers} /></td>
                      </>)}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr className="bg-gray-50">
                <td colSpan={2} className="px-4 py-3 text-sm font-semibold text-gray-700">Gesamt ({payingTenants.length} Mieter)</td>
                <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">{totalRentExpected.toLocaleString("de-DE",{style:"currency",currency:"EUR"})}</td>
                <td className="px-4 py-3 text-sm font-bold text-right"><span className={prevMonthPaidTotal >= totalRentExpected ? "text-emerald-600" : "text-red-600"}>{prevMonthPaidTotal.toLocaleString("de-DE",{style:"currency",currency:"EUR"})}</span></td>
                <td className="px-4 py-3 text-sm font-bold text-right"><span className={currentMonthPaidTotal >= totalRentExpected ? "text-emerald-600" : "text-gray-600"}>{currentMonthImported ? currentMonthPaidTotal.toLocaleString("de-DE",{style:"currency",currency:"EUR"}) : "–"}</span></td>
              </tr></tfoot>
            </table>
          </div>
        )}

        {activeTab === "former" && formerTenants.length === 0 && <div className="text-center py-12 bg-white rounded-xl border border-gray-200"><p className="text-sm text-gray-500">Keine ehemaligen Mieter vorhanden.</p></div>}
        {activeTab === "former" && formerTenants.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full"><thead><tr className="border-b border-gray-100 bg-gray-50"><th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">Name</th><th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">Wohnung</th><th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">Letzte Miete</th></tr></thead>
            <tbody>{formerTenants.map((t) => <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50"><td className="px-4 py-3 text-sm text-gray-600">{t.name}</td><td className="px-4 py-3 text-sm text-gray-600">{t.unit_label}</td><td className="px-4 py-3 text-sm text-gray-600 text-right">{t.rent_total.toLocaleString("de-DE",{style:"currency",currency:"EUR"})}</td></tr>)}</tbody></table>
          </div>
        )}
      </main>

      <AddTenantModal isOpen={showAddTenant} onClose={() => setShowAddTenant(false)} onCreated={loadData} objectId={id}/>
      <ExcelImportModal isOpen={showExcelImport} onClose={() => setShowExcelImport(false)} onImported={loadData} objectId={id}/>
      <BankImportModal isOpen={showBankImport} onClose={() => setShowBankImport(false)} onImported={loadData} objectId={id} tenants={activeTenants}/>
      <TenantDetailModal tenant={selectedTenant} saldo={selectedTenant ? tenantSaldos.get(selectedTenant.id) || null : null} isOpen={!!selectedTenant} onClose={() => setSelectedTenant(null)}/>
    </div>
  );
}
