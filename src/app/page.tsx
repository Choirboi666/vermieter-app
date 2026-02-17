"use client";

import { useState } from "react";

// Placeholder data - später kommt das aus Supabase
const DEMO_OBJECTS = [
  {
    id: "1",
    name: "Musterstraße 12",
    address: "10115 Berlin",
    units: 8,
    paid: 6,
    open: 2,
    unclear: 0,
  },
  {
    id: "2",
    name: "Hauptweg 5",
    address: "10437 Berlin",
    units: 12,
    paid: 10,
    open: 1,
    unclear: 1,
  },
  {
    id: "3",
    name: "Gartenallee 22",
    address: "12047 Berlin",
    units: 6,
    paid: 6,
    open: 0,
    unclear: 0,
  },
];

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

export default function Home() {
  const [objects] = useState(DEMO_OBJECTS);

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
          <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
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
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {objects.reduce((sum, o) => sum + o.units, 0)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Offene Mieten</p>
            <p className="text-2xl font-bold text-red-600 mt-1">
              {objects.reduce((sum, o) => sum + o.open, 0)}
            </p>
          </div>
        </div>

        {/* Object Cards */}
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
                    {obj.address} · {obj.units} Einheiten
                  </p>
                  <StatusBadge
                    paid={obj.paid}
                    open={obj.open}
                    unclear={obj.unclear}
                  />
                </div>
                <div className="flex items-center gap-2">
                  {obj.open > 0 ? (
                    <span className="w-3 h-3 rounded-full bg-red-500" title="Offene Mieten" />
                  ) : (
                    <span className="w-3 h-3 rounded-full bg-emerald-500" title="Alles bezahlt" />
                  )}
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
      </main>
    </div>
  );
}
