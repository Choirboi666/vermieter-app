"use client";

import { useState, useEffect, use, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import ExcelImportModal from "@/components/ExcelImportModal";
import BankImportModal from "@/components/BankImportModal";
import DunningModal from "@/components/DunningModal";
import LandlordSettingsModal from "@/components/LandlordSettingsModal";
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
  landlord_name: string | null;
  landlord_address: string | null;
  landlord_city: string | null;
  landlord_phone: string | null;
  landlord_email: string | null;
  object_street: string | null;
  object_city: string | null;
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
  move_out_date: string | null;
  lease_end: string | null;
  is_commercial: boolean;
  wg_type: string | null;
  notes: string | null;
  starting_balance: number | null;
  contact_street: string | null;
  contact_zip: string | null;
  contact_city: string | null;
  contact_email: string | null;
  contact_phone1: string | null;
  contact_phone2: string | null;
}

// Betrag farbig anzeigen: grün wenn >= soll, rot wenn darunter
// Betrag farbig anzeigen + Dropdown: Manuell eingeben / Zahlung zuordnen / Mietminderung
function MonthAmountCell({ saldo, monthKey, rentTotal, tenantId, objectId, onManualEntry, unmatchedTx, wgMembers, reduction, onLog }: {
  saldo: TenantSaldo | undefined; monthKey: string; rentTotal: number; tenantId: string; objectId: string; onManualEntry: () => void;
  unmatchedTx: Transaction[]; wgMembers?: { id: string; name: string }[]; reduction?: number;
  onLog?: (type: string, desc: string, data: any) => Promise<void>;
}) {
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [reducing, setReducing] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const [reductionVal, setReductionVal] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set());
  const [targetMemberId, setTargetMemberId] = useState<string>(tenantId);

  if (!saldo) return <span className="text-xs text-gray-400">{"\u2013"}</span>;
  const ms = saldo.months.find((m) => m.month === monthKey);
  if (!ms) return <span className="text-xs text-gray-400">{"\u2013"}</span>;
  const val = ms.covered;
  const effectiveSoll = ms.soll;
  const isOk = val >= effectiveSoll;
  const isPartial = val > 0 && val < effectiveSoll;

  const handleSaveManual = async () => {
    const amount = parseFloat(inputVal.replace(",", "."));
    if (isNaN(amount) || amount < 0) { setEditing(false); return; }
    setSaving(true);
    // IDs der bestehenden manuellen Einträge merken (für Undo)
    const { data: oldManual } = await supabase.from("transactions").select("id")
      .eq("object_id", objectId).eq("tenant_id", tenantId).eq("month_period", monthKey)
      .eq("purpose_raw", "Manuelle Eingabe");
    // IDs der automatisch gematchten Transaktionen merken (für Undo: re-match)
    const { data: oldMatched } = await supabase.from("transactions").select("id")
      .eq("object_id", objectId).eq("tenant_id", tenantId).eq("month_period", monthKey)
      .neq("purpose_raw", "Manuelle Eingabe");
    // Überschreiben: bestehende manuelle Einträge löschen
    if (oldManual?.length) await supabase.from("transactions").delete().in("id", oldManual.map(t => t.id));
    // Automatisch gematchte ent-matchen
    if (oldMatched?.length) await supabase.from("transactions").update({ tenant_id: null, status: "unmatched", match_reason: null, confidence: 0 }).in("id", oldMatched.map(t => t.id));
    // Neue manuelle Eingabe (nur wenn Betrag > 0)
    let newId = null;
    if (amount > 0) {
      const { data } = await supabase.from("transactions").insert({
        object_id: objectId, tenant_id: tenantId, date: `${monthKey}-15`,
        amount, purpose_raw: "Manuelle Eingabe", confidence: 1,
        match_reason: "Manuell eingetragen", status: "matched", month_period: monthKey,
      }).select("id").single();
      newId = data?.id;
    }
    if (onLog) await onLog("manual_payment", `${amount.toFixed(2)}€ manuell eingetragen (${monthKey})`, {
      transaction_id: newId,
      tenant_id: tenantId,
      unmatched_ids: oldMatched?.map(t => t.id) || [],
    });
    setSaving(false); setEditing(false); setInputVal(""); onManualEntry();
  };

  const handleSaveReduction = async () => {
    const amount = parseFloat(reductionVal.replace(",", "."));
    if (isNaN(amount) || amount <= 0) { setReducing(false); return; }
    setSaving(true);
    const { data } = await supabase.from("rent_reductions").insert({
      object_id: objectId, tenant_id: tenantId, month: monthKey, amount,
    }).select("id").single();
    if (data && onLog) await onLog("rent_reduction", `Mietminderung ${amount.toFixed(2)}€ für ${monthKey}`, { reduction_id: data.id });
    setSaving(false); setReducing(false); setReductionVal(""); onManualEntry();
  };

  const handleAssign = async () => {
    if (selectedTxIds.size === 0) return;
    setSaving(true);
    const txIds = Array.from(selectedTxIds);
    for (const txId of txIds) {
      await supabase.from("transactions").update({
        tenant_id: targetMemberId, status: "matched",
        match_reason: "Manuell zugeordnet", confidence: 1,
      }).eq("id", txId);
    }
    if (onLog) await onLog("assign_payment", `${txIds.length} Zahlung(en) zugeordnet`, { transaction_ids: txIds, previous_tenant_id: null });
    setSaving(false); setAssigning(false); setSelectedTxIds(new Set()); setTargetMemberId(tenantId); onManualEntry();
  };

  const toggleTx = (txId: string) => {
    setSelectedTxIds((prev) => { const n = new Set(prev); if (n.has(txId)) n.delete(txId); else n.add(txId); return n; });
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

  if (reducing) {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="text-[10px] text-gray-400">Minderung f\u00fcr {monthKey}</span>
        <input type="text" autoFocus value={reductionVal}
          onChange={(e) => { const v = e.target.value.replace(/[^0-9.,]/g, ""); setReductionVal(v); }}
          onKeyDown={(e) => { if (e.key === "Enter") handleSaveReduction(); if (e.key === "Escape") { setReducing(false); setReductionVal(""); } }}
          onBlur={() => { if (!saving) { setReducing(false); setReductionVal(""); } }}
          placeholder="z.B. 100"
          className="w-24 px-2 py-1 text-sm text-right border border-amber-400 rounded focus:ring-2 focus:ring-amber-500 outline-none"
        />
      </div>
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
    <div className="relative inline-flex items-center gap-0.5" onMouseEnter={() => setHover(true)} onMouseLeave={() => { setHover(false); setMenuOpen(false); }}>
      <span className={`text-sm font-medium ${isOk ? "text-emerald-600" : isPartial ? "text-red-500" : "text-red-600"}`}>
        {val.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
      </span>
      <button onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
        className={`w-4 h-4 flex-shrink-0 flex items-center justify-center text-gray-400 hover:text-blue-600 rounded transition-opacity ${hover ? "opacity-100" : "opacity-30 md:opacity-0 md:pointer-events-none"}`} title="Zahlung bearbeiten">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-0.5 w-44">
          <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setEditing(true); }}
            className="w-full text-left px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-1.5">
            <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
            Manuell eingeben
          </button>
          <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setAssigning(true); }}
            className="w-full text-left px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-1.5">
            <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.04a4.5 4.5 0 00-6.364-6.364L4.34 8.3" /></svg>
            Zahlung zuordnen
          </button>
          <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setReducing(true); }}
            className="w-full text-left px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-1.5">
            <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Mietminderung
          </button>
        </div>
      )}
    </div>
  );
}


// Kompakte Zelle für WG-Mitglieder ohne Soll – zeigt Betrag in grau + Zuordnungs-Option
function WgSubAmountCell({ amount, tenantId, objectId, onManualEntry, unmatchedTx, wgMembers, onLog }: {
  amount?: number; tenantId: string; objectId: string; onManualEntry: () => void;
  unmatchedTx: Transaction[]; wgMembers?: { id: string; name: string }[];
  onLog?: (type: string, desc: string, data: any) => Promise<void>;
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
    const txIds = Array.from(selectedTxIds);
    for (const txId of txIds) {
      await supabase.from("transactions").update({ tenant_id: targetMemberId, status: "matched", match_reason: "Manuell zugeordnet", confidence: 1 }).eq("id", txId);
    }
    if (onLog) await onLog("assign_payment", `${txIds.length} Zahlung(en) zugeordnet`, { transaction_ids: txIds, previous_tenant_id: null });
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
    <div className="relative inline-flex items-center gap-0.5" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <span className="text-sm text-gray-400">{amount ? amount.toLocaleString("de-DE",{style:"currency",currency:"EUR"}) : "\u2013"}</span>
      <button onClick={(e) => { e.stopPropagation(); setAssigning(true); }}
        className={`w-4 h-4 flex-shrink-0 flex items-center justify-center text-gray-400 hover:text-blue-600 rounded transition-opacity ${hover ? "opacity-100" : "opacity-30 md:opacity-0 md:pointer-events-none"}`} title="Zahlung zuordnen">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.04a4.5 4.5 0 00-6.364-6.364L4.34 8.3" /></svg>
      </button>
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
          {(tenant.contact_street || tenant.contact_email || tenant.contact_phone1) && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">Kontaktdaten</p>
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-700">
                {tenant.contact_street && <div><span className="text-gray-400">Adresse: </span>{tenant.contact_street}{tenant.contact_zip && `, ${tenant.contact_zip}`}{tenant.contact_city && ` ${tenant.contact_city}`}</div>}
                {tenant.contact_email && <div><span className="text-gray-400">E-Mail: </span>{tenant.contact_email}</div>}
                {tenant.contact_phone1 && <div><span className="text-gray-400">Tel: </span>{tenant.contact_phone1}</div>}
                {tenant.contact_phone2 && <div><span className="text-gray-400">Tel 2: </span>{tenant.contact_phone2}</div>}
              </div>
            </div>
          )}
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

// ============================================================
// Mieterwechsel-Modal
// ============================================================
function TenantChangeModal({ isOpen, onClose, onCreated, objectId, tenants, onLog }: {
  isOpen: boolean; onClose: () => void; onCreated: () => void; objectId: string; tenants: Tenant[];
  onLog?: (type: string, desc: string, data: any) => Promise<void>;
}) {
  const activeTenants = tenants.filter((t) => t.is_active && t.name.toLowerCase() !== "leerstand");
  const [selectedPrevTenantId, setSelectedPrevTenantId] = useState<string>("");
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [unitLabel, setUnitLabel] = useState("");
  const [areaSqm, setAreaSqm] = useState("");
  const [rentCold, setRentCold] = useState("");
  const [utilitiesCold, setUtilitiesCold] = useState("");
  const [heatingCosts, setHeatingCosts] = useState("");
  const [vat, setVat] = useState("");
  const [rentTotal, setRentTotal] = useState("");
  const [moveInDate, setMoveInDate] = useState("");
  const [moveOutDate, setMoveOutDate] = useState("");
  const [leaseEnd, setLeaseEnd] = useState("");
  const [wgType, setWgType] = useState("");
  const [isCommercial, setIsCommercial] = useState(false);
  const [notes, setNotes] = useState("");
  const [autoMoveIn, setAutoMoveIn] = useState(true);
  const [saving, setSaving] = useState(false);

  // Auto-calculate rent total
  useEffect(() => {
    const t = (parseFloat(rentCold) || 0) + (parseFloat(utilitiesCold) || 0) + (parseFloat(heatingCosts) || 0) + (parseFloat(vat) || 0);
    if (t > 0) setRentTotal(t.toFixed(2));
  }, [rentCold, utilitiesCold, heatingCosts, vat]);

  // Auto-calculate move-in date from move-out date
  useEffect(() => {
    if (autoMoveIn && moveOutDate) {
      const d = new Date(moveOutDate);
      d.setMonth(d.getMonth() + 1);
      const firstOfNext = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
      setMoveInDate(firstOfNext);
    }
  }, [moveOutDate, autoMoveIn]);

  // Fill fields when previous tenant is selected
  useEffect(() => {
    if (!selectedPrevTenantId) return;
    const prev = activeTenants.find((t) => t.id === selectedPrevTenantId);
    if (!prev) return;
    setUnitLabel(prev.unit_label);
    setAreaSqm(prev.area_sqm ? String(prev.area_sqm) : "");
    setRentCold(prev.rent_cold ? String(prev.rent_cold) : "");
    setUtilitiesCold(prev.utilities_cold ? String(prev.utilities_cold) : "");
    setHeatingCosts(prev.heating_costs ? String(prev.heating_costs) : "");
    setVat(prev.vat ? String(prev.vat) : "");
    setRentTotal(prev.rent_total ? String(prev.rent_total) : "");
    setWgType(prev.wg_type || "");
    setIsCommercial(prev.is_commercial);
    setNumber(prev.number || "");
    // Name, lease_end, moveInDate, notes bleiben leer
    setName("");
    setLeaseEnd("");
    setNotes("");
    setMoveOutDate("");
    setMoveInDate("");
    setAutoMoveIn(true);
  }, [selectedPrevTenantId]);

  const reset = () => {
    setSelectedPrevTenantId(""); setName(""); setNumber(""); setUnitLabel(""); setAreaSqm("");
    setRentCold(""); setUtilitiesCold(""); setHeatingCosts(""); setVat(""); setRentTotal("");
    setMoveInDate(""); setMoveOutDate(""); setLeaseEnd(""); setWgType(""); setIsCommercial(false);
    setNotes(""); setAutoMoveIn(true);
  };

  if (!isOpen) return null;

  const prevTenant = activeTenants.find((t) => t.id === selectedPrevTenantId);

  const handleSave = async () => {
    if (!selectedPrevTenantId || !name.trim() || !unitLabel.trim() || !rentTotal) return;
    setSaving(true);

    // 1. Neuen Mieter anlegen
    const { data: newTenant, error: insertErr } = await supabase.from("tenants").insert({
      object_id: objectId, number: number.trim() || null, name: name.trim(), unit_label: unitLabel.trim(),
      area_sqm: areaSqm ? parseFloat(areaSqm) : null, rent_cold: rentCold ? parseFloat(rentCold) : null,
      utilities_cold: utilitiesCold ? parseFloat(utilitiesCold) : null, heating_costs: heatingCosts ? parseFloat(heatingCosts) : null,
      vat: vat ? parseFloat(vat) : null, rent_total: parseFloat(rentTotal), is_active: true,
      move_in_date: moveInDate || null, lease_end: leaseEnd || null,
      wg_type: wgType || null, is_commercial: isCommercial, notes: notes.trim() || null,
    }).select("id").single();

    if (insertErr) {
      alert("Fehler beim Anlegen: " + insertErr.message);
      setSaving(false);
      return;
    }

    // 2. Vormieter deaktivieren + Auszugsdatum setzen
    const { error: updateErr } = await supabase.from("tenants").update({
      is_active: false,
      move_out_date: moveOutDate || null,
    }).eq("id", selectedPrevTenantId);

    if (updateErr) {
      alert("Fehler beim Deaktivieren des Vormieters: " + updateErr.message);
    }

    // 3. Action loggen
    if (onLog && newTenant) {
      await onLog("tenant_change", `Mieterwechsel: ${prevTenant?.name} → ${name.trim()} (${unitLabel.trim()})`, {
        new_tenant_id: newTenant.id, old_tenant_id: selectedPrevTenantId,
      });
    }

    setSaving(false);
    reset();
    onCreated();
    onClose();
  };

  // Unique unit_labels for dropdown grouping
  const uniqueUnits = [...new Set(activeTenants.map((t) => t.unit_label))].sort();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Mieterwechsel</h2>
          <p className="text-sm text-gray-500 mt-1">Nachmieter anlegen, Vormieter wird automatisch zu Ehemalige verschoben</p>
        </div>
        <div className="p-6 space-y-4">
          {/* Vormieter auswählen */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <label className="block text-sm font-semibold text-amber-800 mb-2">Vormieter auswählen *</label>
            <select value={selectedPrevTenantId} onChange={(e) => setSelectedPrevTenantId(e.target.value)}
              className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-amber-500 outline-none">
              <option value="">– Bitte Vormieter wählen –</option>
              {uniqueUnits.map((unit) => (
                <optgroup key={unit} label={unit}>
                  {activeTenants.filter((t) => t.unit_label === unit).map((t) => (
                    <option key={t.id} value={t.id}>{t.name} – {t.rent_total.toLocaleString("de-DE", {style:"currency",currency:"EUR"})}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {prevTenant && (
              <p className="text-xs text-amber-600 mt-2">
                {prevTenant.name} wird nach dem Speichern zu den Ehemaligen verschoben.
              </p>
            )}
          </div>

          {selectedPrevTenantId && (<>
            {/* Auszugsdatum */}
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <label className="block text-sm font-semibold text-red-800 mb-2">Auszugsdatum Vormieter</label>
              <input type="date" value={moveOutDate} onChange={(e) => setMoveOutDate(e.target.value)}
                className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-red-500 outline-none" />
            </div>

            <hr className="border-gray-200" />
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Nachmieter</p>

            {/* Name + Nummer */}
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Name Nachmieter *</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Schmidt" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Nummer</label><input type="text" value={number} onChange={(e) => setNumber(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" /></div>
            </div>

            {/* Einzugsdatum mit Auto-Checkbox */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-gray-700">Einzugsdatum Nachmieter</label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={autoMoveIn} onChange={(e) => { setAutoMoveIn(e.target.checked); if (!e.target.checked) setMoveInDate(""); }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-xs text-gray-500">01. nach Auszugsdatum</span>
                </label>
              </div>
              <input type="date" value={moveInDate} onChange={(e) => { setMoveInDate(e.target.value); if (autoMoveIn) setAutoMoveIn(false); }}
                className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none ${autoMoveIn ? "bg-gray-50 text-gray-600" : ""}`} />
            </div>

            {/* Wohnung + Fläche (vorausgefüllt) */}
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Wohnung *</label><input type="text" value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Fläche (m²)</label><input type="number" value={areaSqm} onChange={(e) => setAreaSqm(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none" /></div>
            </div>

            {/* Mietzusammensetzung (vorausgefüllt) */}
            <hr className="border-gray-200" />
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Mietzusammensetzung</p>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Kaltmiete (€)</label><input type="number" step="0.01" value={rentCold} onChange={(e) => setRentCold(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Kalte BK (€)</label><input type="number" step="0.01" value={utilitiesCold} onChange={(e) => setUtilitiesCold(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Heizkosten (€)</label><input type="number" step="0.01" value={heatingCosts} onChange={(e) => setHeatingCosts(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">USt. (€)</label><input type="number" step="0.01" value={vat} onChange={(e) => setVat(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" /></div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <label className="block text-sm font-medium text-blue-800 mb-1">Bruttogesamtmiete (€) *</label>
              <input type="number" step="0.01" value={rentTotal} onChange={(e) => setRentTotal(e.target.value)} className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm font-semibold text-blue-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>

            {/* Befristung */}
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Befristung</label><input type="date" value={leaseEnd} onChange={(e) => setLeaseEnd(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" /></div>

            {/* Notizen */}
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Notizen</label><input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="z.B. Nachmieter von Menthel" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" /></div>
          </>)}
        </div>
        <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
          <button onClick={() => { reset(); onClose(); }} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Abbrechen</button>
          <button onClick={handleSave} disabled={!selectedPrevTenantId || !name.trim() || !unitLabel.trim() || !rentTotal || saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50">
            {saving ? "Speichern..." : "Mieterwechsel durchführen"}
          </button>
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
  const [rentReductionsRaw, setRentReductionsRaw] = useState<{tenant_id: string; month: string; amount: number}[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddTenant, setShowAddTenant] = useState(false);
  const [showTenantChange, setShowTenantChange] = useState(false);
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [showBankImport, setShowBankImport] = useState(false);
  const [showDunning, setShowDunning] = useState(false);
  const [showLandlordSettings, setShowLandlordSettings] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [activeTab, setActiveTab] = useState<"active" | "former">("active");
  const [actionLog, setActionLog] = useState<{id: string; action_type: string; description: string; undo_data: any; created_at: string}[]>([]);
  const [showUndo, setShowUndo] = useState(false);

  const loadData = async () => {
    const { data: objData } = await supabase.from("objects").select("*").eq("id", id).single();
    if (objData) setObject(objData);
    const { data: tenantData } = await supabase.from("tenants").select("*").eq("object_id", id).order("unit_label", { ascending: true });
    if (tenantData) setTenants(tenantData);
    const { data: txData } = await supabase.from("transactions").select("*").eq("object_id", id).order("date", { ascending: false });
    if (txData) setTransactions(txData);
    const { data: rrData } = await supabase.from("rent_reductions").select("tenant_id, month, amount").eq("object_id", id);
    if (rrData) setRentReductionsRaw(rrData);
    const { data: alData } = await supabase.from("action_log").select("*").eq("object_id", id).order("created_at", { ascending: false }).limit(20);
    if (alData) setActionLog(alData);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [id]);

  // Action-Log Helper
  const logAction = async (actionType: string, description: string, undoData: any) => {
    await supabase.from("action_log").insert({ object_id: id, action_type: actionType, description, undo_data: undoData });
  };

  // Undo Handler
  const handleUndo = async (action: typeof actionLog[0]) => {
    const d = action.undo_data;
    try {
      switch (action.action_type) {
        case "manual_payment":
          // Lösche die manuell eingefügte Transaktion
          if (d.transaction_id) await supabase.from("transactions").delete().eq("id", d.transaction_id);
          // Re-matche die zuvor ent-matchten Bank-Transaktionen
          if (d.unmatched_ids?.length) {
            for (const txId of d.unmatched_ids) {
              await supabase.from("transactions").update({ tenant_id: d.tenant_id || null, status: "matched", match_reason: "Wiederhergestellt (Undo)" }).eq("id", txId);
            }
          }
          break;
        case "assign_payment":
          // Setze tenant_id zurück auf null
          for (const txId of d.transaction_ids) {
            await supabase.from("transactions").update({ tenant_id: null, status: "unmatched", match_reason: null, confidence: 0 }).eq("id", txId);
          }
          break;
        case "rent_reduction":
          // Lösche die Mietminderung
          await supabase.from("rent_reductions").delete().eq("id", d.reduction_id);
          break;
        case "tenant_change":
          // Lösche neuen Mieter, reaktiviere alten
          await supabase.from("tenants").delete().eq("id", d.new_tenant_id);
          await supabase.from("tenants").update({ is_active: true, move_out_date: null }).eq("id", d.old_tenant_id);
          break;
      }
      // Action-Log-Eintrag löschen
      await supabase.from("action_log").delete().eq("id", action.id);
      loadData();
    } catch (err) {
      alert("Fehler beim Rückgängig machen: " + err);
    }
  };

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

  // Alle Monate mit zugeordneten Transaktionen
  const importedMonths = useMemo(() => {
    return new Set(transactions.filter((t) => t.tenant_id).map((t) => t.date.substring(0, 7)));
  }, [transactions]);

  const prevMonthImported = importedMonths.has(prevMonth);

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

  // Mietminderungen pro Mieter aufbereiten: tenant_id → Map<month, amount>
  const rentReductionsMap = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    rentReductionsRaw.forEach((rr) => {
      if (!map.has(rr.tenant_id)) map.set(rr.tenant_id, new Map());
      const mMap = map.get(rr.tenant_id)!;
      mMap.set(rr.month, (mMap.get(rr.month) || 0) + rr.amount);
    });
    return map;
  }, [rentReductionsRaw]);

  const tenantSaldos = useMemo(() => {
    const map = new Map<string, TenantSaldo>();
    activeTenants.forEach((t) => {
      if (t.rent_total > 0 && t.name.toLowerCase() !== "leerstand") {
        const wgMembers = wgGroups.get(t.unit_label);
        const wgMemberIds = wgMembers ? wgMembers.map((m) => m.id) : undefined;
        const reductions = rentReductionsMap.get(t.id);
        map.set(t.id, calcTenantSaldo(t.id, t.rent_total, t.move_in_date, transactions, earliestDataMonth, latestDataMonth, wgMemberIds, reductions));
      }
    });
    return map;
  }, [activeTenants, transactions, earliestDataMonth, latestDataMonth, wgGroups, rentReductionsMap]);

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
              {!prevMonthImported ? (
                <div className="flex items-center gap-2 mt-2"><span className="w-2 h-2 rounded-full bg-red-500"/><p className="text-sm text-gray-500">Kontoauszug noch nicht importiert</p></div>
              ) : (<>
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
        <div className="flex gap-3 mb-6 flex-wrap items-center">
          <button onClick={() => setShowAddTenant(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">+ Mieter anlegen</button>
          <button onClick={() => setShowTenantChange(true)} className="bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 transition-colors inline-flex items-center gap-1.5"><svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" /></svg>Mieterwechsel</button>
          <button onClick={() => setShowExcelImport(true)} className="bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 transition-colors inline-flex items-center gap-1.5"><svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>Mieterliste</button>
          <button onClick={() => setShowBankImport(true)} className="bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 transition-colors inline-flex items-center gap-1.5"><svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21" /></svg>Bankauszug</button>
          <button onClick={() => setShowDunning(true)} className="bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 transition-colors inline-flex items-center gap-1.5"><svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>Mahnungen</button>
          <button onClick={() => setShowLandlordSettings(true)} className={`text-sm font-medium px-4 py-2 rounded-lg border transition-colors inline-flex items-center gap-1.5 ${!object.landlord_name ? "bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-300" : "bg-white hover:bg-gray-50 text-gray-700 border-gray-300"}`}><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>{!object.landlord_name ? "Vermieter-Daten hinterlegen" : "Einstellungen"}</button>
          {/* Undo Button */}
          <div className="relative">
            <button onClick={() => setShowUndo(!showUndo)}
              className={`text-sm font-medium px-4 py-2 rounded-lg border transition-colors inline-flex items-center gap-1.5 ${actionLog.length > 0 ? "bg-white hover:bg-gray-50 text-gray-700 border-gray-300" : "bg-gray-100 text-gray-400 border-gray-200 cursor-default"}`}
              title={actionLog.length > 0 ? `${actionLog.length} Aktionen rückgängig machbar` : "Noch keine Aktionen"} disabled={actionLog.length === 0}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
              Rückgängig{actionLog.length > 0 ? ` (${actionLog.length})` : ""}
            </button>
            {showUndo && actionLog.length > 0 && (
              <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 w-80 max-h-80 overflow-y-auto">
                <div className="p-3 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-900">Letzte Aktionen</h3></div>
                <div className="py-1">
                  {actionLog.map((action) => (
                    <div key={action.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 group">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 truncate">{action.description}</p>
                        <p className="text-[10px] text-gray-400">{new Date(action.created_at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                      <button onClick={async () => { if (confirm(`"${action.description}" rückgängig machen?`)) { await handleUndo(action); setShowUndo(false); } }}
                        className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 shrink-0" title="Rückgängig">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
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
                  const tenantReductions = rentReductionsMap.get(tenant.id);
                  const prevReduction = tenantReductions?.get(prevMonth) || 0;
                  const currReduction = tenantReductions?.get(currentMonth) || 0;
                  const hasAnyReduction = prevReduction > 0 || currReduction > 0;
                  return (
                    <tr key={tenant.id} onClick={() => !isLeerstand && !isWgSub && tenant.rent_total > 0 && setSelectedTenant(tenant)} className={`border-b border-gray-50 transition-colors ${isLeerstand ? "bg-gray-50/50" : isWgSub ? "bg-blue-50/20" : "hover:bg-blue-50/50 cursor-pointer"}`}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {isLeerstand ? <span className="text-gray-400 italic">{tenant.name}</span> : isWgSub ? <span className="text-gray-400 italic pl-3">↳ {tenant.name}</span> : <>{tenant.name}{tenant.wg_type && <span className="ml-1.5 text-xs text-blue-500">WG-{tenant.wg_type?.charAt(0)}</span>}{tenant.is_commercial && <span className="ml-1.5 text-xs text-orange-500">Gew.</span>}</>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{tenant.unit_label}</td>
                      <td className="px-4 py-3 text-sm text-right">{tenant.rent_total > 0 ? (
                        hasAnyReduction ? <span className="text-gray-400">{Math.max(0, tenant.rent_total - Math.max(prevReduction, currReduction)).toLocaleString("de-DE",{style:"currency",currency:"EUR"})} <span className="text-[10px] block text-gray-400">gemindert</span></span>
                        : <span className="text-gray-900">{tenant.rent_total.toLocaleString("de-DE",{style:"currency",currency:"EUR"})}</span>
                      ) : <span className="text-gray-400">{"\u2013"}</span>}</td>
                      {isWgSub ? (<>
                        <td className="px-4 py-3 text-right"><WgSubAmountCell amount={mPayments?.get(prevMonth)} tenantId={tenant.id} objectId={id} onManualEntry={loadData} unmatchedTx={unmatchedTx} wgMembers={wgMembers} onLog={logAction} /></td>
                        <td className="px-4 py-3 text-right"><WgSubAmountCell amount={mPayments?.get(currentMonth)} tenantId={tenant.id} objectId={id} onManualEntry={loadData} unmatchedTx={unmatchedTx} wgMembers={wgMembers} onLog={logAction} /></td>
                      </>) : (<>
                        <td className="px-4 py-3 text-right"><MonthAmountCell saldo={saldo} monthKey={prevMonth} rentTotal={tenant.rent_total} tenantId={tenant.id} objectId={id} onManualEntry={loadData} unmatchedTx={unmatchedTx} wgMembers={wgMembers} reduction={prevReduction} onLog={logAction} /></td>
                        <td className="px-4 py-3 text-right"><MonthAmountCell saldo={saldo} monthKey={currentMonth} rentTotal={tenant.rent_total} tenantId={tenant.id} objectId={id} onManualEntry={loadData} unmatchedTx={unmatchedTx} wgMembers={wgMembers} reduction={currReduction} onLog={logAction} /></td>
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
            <table className="w-full"><thead><tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">Name</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">Wohnung</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">Letzte Miete</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">Auszug</th>
            </tr></thead>
            <tbody>{formerTenants.map((t) => <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-4 py-3 text-sm text-gray-600">{t.name}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{t.unit_label}</td>
              <td className="px-4 py-3 text-sm text-gray-600 text-right">{t.rent_total.toLocaleString("de-DE",{style:"currency",currency:"EUR"})}</td>
              <td className="px-4 py-3 text-sm text-gray-400 text-right">{t.move_out_date || "–"}</td>
            </tr>)}</tbody></table>
          </div>
        )}
      </main>

      <AddTenantModal isOpen={showAddTenant} onClose={() => setShowAddTenant(false)} onCreated={loadData} objectId={id}/>
      <TenantChangeModal isOpen={showTenantChange} onClose={() => setShowTenantChange(false)} onCreated={loadData} objectId={id} tenants={tenants} onLog={logAction}/>
      <ExcelImportModal isOpen={showExcelImport} onClose={() => setShowExcelImport(false)} onImported={loadData} objectId={id} objectStreet={object?.object_street || null} objectCity={object?.object_city || null} objectName={object?.name} tenants={tenants as any} transactions={transactions.map(t => ({ tenant_id: t.tenant_id, date: t.date, amount: t.amount, month_period: t.month_period }))}/>
      <BankImportModal isOpen={showBankImport} onClose={() => setShowBankImport(false)} onImported={loadData} objectId={id} tenants={activeTenants}/>
      <TenantDetailModal tenant={selectedTenant} saldo={selectedTenant ? tenantSaldos.get(selectedTenant.id) || null : null} isOpen={!!selectedTenant} onClose={() => setSelectedTenant(null)}/>
      {object && <DunningModal
        isOpen={showDunning}
        onClose={() => setShowDunning(false)}
        objectId={id}
        objectName={object.name}
        objectAddress={object.address}
        objectIban={object.iban}
        objectBic={object.bic}
        landlordName={object.landlord_name}
        landlordAddress={object.landlord_address}
        landlordCity={object.landlord_city}
        landlordPhone={object.landlord_phone}
        landlordEmail={object.landlord_email}
        tenants={activeTenants.map(t => ({
          id: t.id,
          name: t.name,
          unit_label: t.unit_label,
          rent_total: t.rent_total,
          is_active: t.is_active,
          address: [t.contact_street, t.contact_zip && t.contact_city ? `${t.contact_zip} ${t.contact_city}` : null].filter(Boolean).join(", ") || undefined,
          wg_main_tenant_id: (t as any).wg_main_tenant_id || null,
        }))}
        transactions={transactions.map(t => ({
          id: t.id,
          tenant_id: t.tenant_id,
          date: t.date,
          amount: t.amount,
          month_period: t.month_period,
        }))}
      />}
      {object && <LandlordSettingsModal
        isOpen={showLandlordSettings}
        onClose={() => setShowLandlordSettings(false)}
        onSaved={loadData}
        objectId={id}
        objectName={object.name}
        objectStreet={object.object_street}
        objectCity={object.object_city}
        landlordName={object.landlord_name}
        landlordAddress={object.landlord_address}
        landlordCity={object.landlord_city}
        landlordPhone={object.landlord_phone}
        landlordEmail={object.landlord_email}
      />}
    </div>
  );
}
