"use client";

import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  generateMieterlisteTemplate,
  parseMieterliste,
  parseKontaktliste,
  generateExport,
  MieterImportRow,
  KontaktImportRow,
  type ExportTenant,
  type ExportTransaction,
} from "@/lib/excel";

export default function ExcelImportModal({
  isOpen,
  onClose,
  onImported,
  objectId,
  objectStreet,
  objectCity,
  objectName,
  tenants: allTenants,
  transactions: allTransactions,
}: {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
  objectId: string;
  objectStreet?: string | null;
  objectCity?: string | null;
  objectName?: string;
  tenants?: ExportTenant[];
  transactions?: ExportTransaction[];
}) {
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [rows, setRows] = useState<MieterImportRow[]>([]);
  const [kontaktRows, setKontaktRows] = useState<KontaktImportRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [existingCount, setExistingCount] = useState(0);
  const [importResult, setImportResult] = useState<{
    success: number;
    failed: number;
    contacts: number;
    contactsFailed: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bestehende Mieter zählen
  useEffect(() => {
    if (isOpen) {
      supabase
        .from("tenants")
        .select("id", { count: "exact", head: true })
        .eq("object_id", objectId)
        .eq("is_active", true)
        .then(({ count }) => {
          setExistingCount(count || 0);
        });
    }
  }, [isOpen, objectId]);

  if (!isOpen) return null;

  const handleDownloadTemplate = () => {
    const data = generateMieterlisteTemplate();
    const blob = new Blob([data], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Mieterliste_Vorlage.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const buffer = await file.arrayBuffer();

    // Mieterliste parsen (Tab 1)
    const mieterResult = parseMieterliste(buffer);

    // Kontaktliste parsen (Tab 4, falls vorhanden)
    const kontaktResult = parseKontaktliste(buffer);

    setRows(mieterResult.rows);
    setKontaktRows(kontaktResult.rows);
    setErrors([...mieterResult.errors, ...kontaktResult.errors]);
    setStep("preview");
  };

  const handleImport = async () => {
    setImporting(true);

    // Schritt 1: Bestehende aktive Mieter dieses Objekts löschen
    const { error: deleteError } = await supabase
      .from("tenants")
      .delete()
      .eq("object_id", objectId)
      .eq("is_active", true);

    if (deleteError) {
      alert("Fehler beim Ersetzen der bestehenden Mieter: " + deleteError.message);
      setImporting(false);
      return;
    }

    // Schritt 2: Neue Mieter einfügen
    let success = 0;
    let failed = 0;

    // Speichere eingefügte Mieter mit Name+Wohnung für Kontakt-Matching
    const insertedTenants: { id: string; name: string; unit_label: string }[] = [];

    for (const row of rows) {
      const { data, error } = await supabase.from("tenants").insert({
        object_id: objectId,
        number: row.number,
        name: row.name,
        unit_label: row.unit_label,
        area_sqm: row.area_sqm,
        rent_per_sqm: row.rent_per_sqm,
        rent_cold: row.rent_cold,
        utilities_cold: row.utilities_cold,
        heating_costs: row.heating_costs,
        vat: row.vat,
        rent_total: row.rent_total,
        move_in_date: row.move_in_date,
        lease_end: row.lease_end === "unbefristet" ? null : row.lease_end,
        is_commercial: row.is_commercial,
        wg_type: row.wg_type,
        notes: row.notes,
        is_active: true,
      }).select("id, name, unit_label").single();

      if (error) {
        failed++;
      } else if (data) {
        success++;
        insertedTenants.push(data);
      }
    }

    // Schritt 3: Kontaktdaten zuordnen (wenn Tab vorhanden)
    let contacts = 0;
    let contactsFailed = 0;

    if (kontaktRows.length > 0) {
      for (const kontakt of kontaktRows) {
        // Match über Name + Wohnungsbezeichnung (case-insensitive)
        const match = insertedTenants.find(
          (t) =>
            t.name.toLowerCase().trim() === kontakt.name.toLowerCase().trim() &&
            t.unit_label.toLowerCase().trim() === kontakt.unit_label.toLowerCase().trim()
        );

        if (match) {
          // Fallback: Wenn keine Adresse im Kontakt → Objektadresse verwenden
          const street = kontakt.contact_street || objectStreet || null;
          const zip = kontakt.contact_zip || (objectCity ? objectCity.split(" ")[0] : null);
          const city = kontakt.contact_city || (objectCity ? objectCity.split(" ").slice(1).join(" ") : null);

          const { error } = await supabase
            .from("tenants")
            .update({
              contact_street: street,
              contact_zip: zip,
              contact_city: city,
              contact_email: kontakt.contact_email,
              contact_phone1: kontakt.contact_phone1,
              contact_phone2: kontakt.contact_phone2,
            })
            .eq("id", match.id);

          if (error) {
            contactsFailed++;
          } else {
            contacts++;
          }
        } else {
          contactsFailed++;
        }
      }
    }

    // Fallback: Mieter ohne Kontakteintrag bekommen die Objektadresse
    if (objectStreet || objectCity) {
      const kontaktNames = new Set(kontaktRows.map(k => `${k.name.toLowerCase().trim()}|${k.unit_label.toLowerCase().trim()}`));
      const tenantsWithoutContact = insertedTenants.filter(
        (t) => !kontaktNames.has(`${t.name.toLowerCase().trim()}|${t.unit_label.toLowerCase().trim()}`)
      );
      if (tenantsWithoutContact.length > 0) {
        const fallbackZip = objectCity ? objectCity.split(" ")[0] : null;
        const fallbackCity = objectCity ? objectCity.split(" ").slice(1).join(" ") : null;
        for (const t of tenantsWithoutContact) {
          await supabase.from("tenants").update({
            contact_street: objectStreet || null,
            contact_zip: fallbackZip,
            contact_city: fallbackCity,
          }).eq("id", t.id);
        }
      }
    }

    setImportResult({ success, failed, contacts, contactsFailed });
    setStep("done");
    setImporting(false);
    onImported();
  };

  const handleClose = () => {
    setStep("upload");
    setRows([]);
    setKontaktRows([]);
    setErrors([]);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            Mieterliste
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {step === "upload" &&
              "Laden Sie die Vorlage herunter, befüllen Sie sie und laden Sie sie hoch."}
            {step === "preview" && "Prüfen Sie die erkannten Daten vor dem Import."}
            {step === "done" && "Import abgeschlossen."}
          </p>
        </div>

        <div className="p-6">
          {/* Step 1: Upload */}
          {step === "upload" && (
            <div className="space-y-6">
              {/* Export aktuelle Daten */}
              {allTenants && allTenants.length > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-emerald-900 mb-2">
                    Mieterliste exportieren
                  </h3>
                  <p className="text-sm text-emerald-700 mb-3">
                    Aktuelle Daten als Excel herunterladen (Mieterliste, Ehemalige, Zahlungen, Kontakte).
                  </p>
                  <button
                    onClick={async () => {
                      const data = await generateExport(objectName || "Export", allTenants, allTransactions || []);
                      const blob = new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `Mieterliste_${(objectName || "Export").replace(/\s+/g, "_")}.xlsx`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    Exportieren
                  </button>
                </div>
              )}

              {/* Download Template */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-blue-900 mb-2">
                  Schritt 1: Vorlage herunterladen
                </h3>
                <p className="text-sm text-blue-700 mb-3">
                  Die Vorlage enthält 4 Tabs: Mieterliste, Ehemalige, Zahlungsliste und Kontakte.
                  Befüllen Sie mindestens die Mieterliste. Der Tab "Kontakte" ist optional – dort können Sie Adressen, E-Mail und Telefonnummern Ihrer Mieter hinterlegen.
                </p>
                <button
                  onClick={handleDownloadTemplate}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  Vorlage herunterladen
                </button>
              </div>

              {/* Upload File */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  Schritt 2: Befüllte Liste hochladen
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  Laden Sie Ihre befüllte Excel-Datei hoch. Unterstützte
                  Formate: .xlsx, .xls
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 file:cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === "preview" && (
            <div className="space-y-4">
              {/* Replace Warning */}
              {existingCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-amber-800 mb-1">
                    Bestehende Mieterliste wird ersetzt
                  </h3>
                  <p className="text-sm text-amber-700">
                    {existingCount} bestehende aktive Mieter werden entfernt und
                    durch {rows.length} Mieter aus der Excel-Datei ersetzt.
                    Ehemalige Mieter bleiben erhalten.
                  </p>
                </div>
              )}

              {/* Parse Errors */}
              {errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-red-800 mb-2">
                    Fehler ({errors.length})
                  </h3>
                  <ul className="space-y-1">
                    {errors.map((err, i) => (
                      <li key={i} className="text-sm text-red-700">
                        {err}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Preview Table - Mieterliste */}
              {rows.length > 0 && (
                <>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                    <p className="text-sm font-medium text-emerald-800">
                      {rows.length} Mieter erkannt
                      {kontaktRows.length > 0 && ` · ${kontaktRows.length} Kontaktdatensätze`}
                    </p>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">
                            Nr.
                          </th>
                          <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">
                            Name
                          </th>
                          <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">
                            Wohnung
                          </th>
                          <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">
                            Kaltmiete
                          </th>
                          <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">
                            Gesamt
                          </th>
                          <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">
                            Einzug
                          </th>
                          <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">
                            Kontakt
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => {
                          // Prüfe ob Kontaktdaten vorhanden
                          const hasContact = kontaktRows.some(
                            (k) =>
                              k.name.toLowerCase().trim() === row.name.toLowerCase().trim() &&
                              k.unit_label.toLowerCase().trim() === row.unit_label.toLowerCase().trim()
                          );
                          return (
                            <tr
                              key={i}
                              className="border-b border-gray-50 hover:bg-gray-50"
                            >
                              <td className="px-3 py-2 text-gray-500">
                                {row.number || "–"}
                              </td>
                              <td className="px-3 py-2 font-medium text-gray-900">
                                {row.name}
                              </td>
                              <td className="px-3 py-2 text-gray-600">
                                {row.unit_label}
                              </td>
                              <td className="px-3 py-2 text-gray-600 text-right">
                                {row.rent_cold
                                  ? `${row.rent_cold.toFixed(2)} €`
                                  : "–"}
                              </td>
                              <td className="px-3 py-2 font-medium text-gray-900 text-right">
                                {row.rent_total.toFixed(2)} €
                              </td>
                              <td className="px-3 py-2 text-gray-500">
                                {row.move_in_date || "–"}
                              </td>
                              <td className="px-3 py-2">
                                {hasContact ? (
                                  <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">✓</span>
                                ) : (
                                  <span className="text-[10px] text-gray-400">–</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {rows.length === 0 && errors.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  Keine Daten in der Datei gefunden.
                </div>
              )}
            </div>
          )}

          {/* Step 3: Done */}
          {step === "done" && importResult && (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">🎉</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Import abgeschlossen!
              </h3>
              <div className="text-sm text-gray-600 space-y-1">
                <p>
                  <span className="text-emerald-600 font-medium">
                    {importResult.success} Mieter erfolgreich importiert
                  </span>
                  {importResult.failed > 0 && (
                    <span className="text-red-600 font-medium">
                      {" "}· {importResult.failed} fehlgeschlagen
                    </span>
                  )}
                </p>
                {(importResult.contacts > 0 || importResult.contactsFailed > 0) && (
                  <p>
                    <span className="text-emerald-600 font-medium">
                      {importResult.contacts} Kontaktdaten zugeordnet
                    </span>
                    {importResult.contactsFailed > 0 && (
                      <span className="text-amber-600 font-medium">
                        {" "}· {importResult.contactsFailed} nicht zugeordnet
                      </span>
                    )}
                  </p>
                )}
              </div>
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

          {step === "preview" && (
            <>
              <button
                onClick={() => {
                  setStep("upload");
                  setRows([]);
                  setKontaktRows([]);
                  setErrors([]);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Zurück
              </button>
              <button
                onClick={handleImport}
                disabled={rows.length === 0 || importing}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {importing
                  ? "Importiere..."
                  : existingCount > 0
                  ? `${existingCount} Mieter ersetzen mit ${rows.length} neuen`
                  : `${rows.length} Mieter importieren`}
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
