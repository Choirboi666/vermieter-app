"use client";

import { useState, useEffect, use } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

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
}

function AddTenantModal({
  isOpen,
  onClose,
  onCreated,
  objectId,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  objectId: string;
}) {
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

  // Bruttogesamtmiete automatisch berechnen
  useEffect(() => {
    const cold = parseFloat(rentCold) || 0;
    const utilities = parseFloat(utilitiesCold) || 0;
    const heating = parseFloat(heatingCosts) || 0;
    const vatAmount = parseFloat(vat) || 0;
    const total = cold + utilities + heating + vatAmount;
    if (total > 0) {
      setRentTotal(total.toFixed(2));
    }
  }, [rentCold, utilitiesCold, heatingCosts, vat]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!name.trim() || !unitLabel.trim() || !rentTotal) return;
    setSaving(true);

    const { error } = await supabase.from("tenants").insert({
      object_id: objectId,
      number: number.trim() || null,
      name: name.trim(),
      unit_label: unitLabel.trim(),
      area_sqm: areaSqm ? parseFloat(areaSqm) : null,
      rent_cold: rentCold ? parseFloat(rentCold) : null,
      utilities_cold: utilitiesCold ? parseFloat(utilitiesCold) : null,
      heating_costs: heatingCosts ? parseFloat(heatingCosts) : null,
      vat: vat ? parseFloat(vat) : null,
      rent_total: parseFloat(rentTotal),
      is_active: true,
    });

    if (error) {
      alert("Fehler beim Speichern: " + error.message);
    } else {
      setNumber("");
      setName("");
      setUnitLabel("");
      setAreaSqm("");
      setRentCold("");
      setUtilitiesCold("");
      setHeatingCosts("");
      setVat("");
      setRentTotal("");
      onCreated();
      onClose();
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            Neuen Mieter anlegen
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Oder importieren Sie eine Mieterliste als Excel-Datei
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nummer
              </label>
              <input
                type="text"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="z.B. M001"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Müller"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Wohnungsbezeichnung *
              </label>
              <input
                type="text"
                value={unitLabel}
                onChange={(e) => setUnitLabel(e.target.value)}
                placeholder="z.B. VH 3. OG rechts"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fläche (m²)
              </label>
              <input
                type="number"
                value={areaSqm}
                onChange={(e) => setAreaSqm(e.target.value)}
                placeholder="z.B. 65"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          <hr className="border-gray-200" />
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Mietzusammensetzung</p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Kaltmiete (€)
              </label>
              <input
                type="number"
                step="0.01"
                value={rentCold}
                onChange={(e) => setRentCold(e.target.value)}
                placeholder="z.B. 500.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Kalte Betriebskosten (€)
              </label>
              <input
                type="number"
                step="0.01"
                value={utilitiesCold}
                onChange={(e) => setUtilitiesCold(e.target.value)}
                placeholder="z.B. 80.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Heizkosten (€)
              </label>
              <input
                type="number"
                step="0.01"
                value={heatingCosts}
                onChange={(e) => setHeatingCosts(e.target.value)}
                placeholder="z.B. 70.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                USt. (€, bei Gewerbe)
              </label>
              <input
                type="number"
                step="0.01"
                value={vat}
                onChange={(e) => setVat(e.target.value)}
                placeholder="z.B. 0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <label className="block text-sm font-medium text-blue-800 mb-1">
              Bruttogesamtmiete (€) *
            </label>
            <input
              type="number"
              step="0.01"
              value={rentTotal}
              onChange={(e) => setRentTotal(e.target.value)}
              placeholder="Wird automatisch berechnet"
              className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm font-semibold text-blue-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <p className="text-xs text-blue-600 mt-1">
              Wird automatisch berechnet, kann aber manuell angepasst werden
            </p>
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
            disabled={!name.trim() || !unitLabel.trim() || !rentTotal || saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Speichern..." : "Mieter anlegen"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ObjectDashboard({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [object, setObject] = useState<ObjectData | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddTenant, setShowAddTenant] = useState(false);
  const [activeTab, setActiveTab] = useState<"active" | "former">("active");

  const loadData = async () => {
    // Objekt laden
    const { data: objData } = await supabase
      .from("objects")
      .select("*")
      .eq("id", id)
      .single();

    if (objData) setObject(objData);

    // Mieter laden
    const { data: tenantData } = await supabase
      .from("tenants")
      .select("*")
      .eq("object_id", id)
      .order("unit_label", { ascending: true });

    if (tenantData) setTenants(tenantData);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const activeTenants = tenants.filter((t) => t.is_active);
  const formerTenants = tenants.filter((t) => !t.is_active);

  const totalRentExpected = activeTenants.reduce(
    (sum, t) => sum + (t.rent_total || 0),
    0
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Wird geladen...</p>
      </div>
    );
  }

  if (!object) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Objekt nicht gefunden</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-3 mb-1">
            <Link
              href="/"
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 19.5L8.25 12l7.5-7.5"
                />
              </svg>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {object.name}
              </h1>
              <p className="text-sm text-gray-500">{object.address}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* KPIs */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Aktive Mieter</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {activeTenants.length}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Soll-Miete / Monat</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {totalRentExpected.toLocaleString("de-DE", {
                style: "currency",
                currency: "EUR",
              })}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Offene Mieten</p>
            <p className="text-2xl font-bold text-red-600 mt-1">0</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Bankauszug importieren →
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => setShowAddTenant(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + Mieter anlegen
          </button>
          <button className="bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 transition-colors">
            📄 Mieterliste importieren
          </button>
          <button className="bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 transition-colors">
            🏦 Bankauszug importieren
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
          <button
            onClick={() => setActiveTab("active")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "active"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Aktive Mieter ({activeTenants.length})
          </button>
          <button
            onClick={() => setActiveTab("former")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "former"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Ehemalige ({formerTenants.length})
          </button>
        </div>

        {/* Tenant List */}
        {activeTab === "active" && activeTenants.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <div className="text-4xl mb-3">👤</div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">
              Noch keine Mieter
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Legen Sie Mieter manuell an oder importieren Sie eine
              Excel-Mieterliste.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setShowAddTenant(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                + Mieter anlegen
              </button>
              <button className="bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 transition-colors">
                📄 Excel importieren
              </button>
            </div>
          </div>
        )}

        {activeTab === "active" && activeTenants.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">
                    Nr.
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">
                    Mieter
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">
                    Wohnung
                  </th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">
                    Kaltmiete
                  </th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">
                    Gesamt
                  </th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {activeTenants.map((tenant) => (
                  <tr
                    key={tenant.id}
                    className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {tenant.number || "–"}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {tenant.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {tenant.unit_label}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right">
                      {tenant.rent_cold
                        ? `${tenant.rent_cold.toLocaleString("de-DE", {
                            style: "currency",
                            currency: "EUR",
                          })}`
                        : "–"}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                      {tenant.rent_total.toLocaleString("de-DE", {
                        style: "currency",
                        currency: "EUR",
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        Kein Import
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50">
                  <td
                    colSpan={4}
                    className="px-4 py-3 text-sm font-semibold text-gray-700"
                  >
                    Gesamt
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                    {totalRentExpected.toLocaleString("de-DE", {
                      style: "currency",
                      currency: "EUR",
                    })}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {activeTab === "former" && formerTenants.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <p className="text-sm text-gray-500">Keine ehemaligen Mieter vorhanden.</p>
          </div>
        )}

        {activeTab === "former" && formerTenants.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">
                    Name
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">
                    Wohnung
                  </th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">
                    Letzte Miete
                  </th>
                </tr>
              </thead>
              <tbody>
                {formerTenants.map((tenant) => (
                  <tr
                    key={tenant.id}
                    className="border-b border-gray-50 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {tenant.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {tenant.unit_label}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right">
                      {tenant.rent_total.toLocaleString("de-DE", {
                        style: "currency",
                        currency: "EUR",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Add Tenant Modal */}
      <AddTenantModal
        isOpen={showAddTenant}
        onClose={() => setShowAddTenant(false)}
        onCreated={loadData}
        objectId={id}
      />
    </div>
  );
}
