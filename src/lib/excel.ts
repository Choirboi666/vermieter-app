import * as XLSX from "xlsx";

// ============================================================
// Excel-Vorlage generieren (wird beim Download erzeugt)
// ============================================================

export function generateMieterlisteTemplate(): Uint8Array {
  const wb = XLSX.utils.book_new();

  // Tab 1: Mieterliste (aktive Mieter)
  const mieterData = [
    [
      "Nummer",
      "Name",
      "Wohnungsbezeichnung",
      "Fläche (m²)",
      "Kaltmiete/m²",
      "Kaltmiete",
      "Kalte Betriebskosten",
      "Heizkosten",
      "Befristung",
      "USt.",
      "Bruttogesamtmiete",
      "Einzugsdatum",
      "Besonderheit",
      "Gewerbe",
      "WG-Typ",
    ],
    [
      "M001",
      "Max Mustermieter",
      "VH 2. OG rechts",
      65,
      7.69,
      500,
      80,
      70,
      "unbefristet",
      0,
      650,
      "01.08.2023",
      "",
      "Nein",
      "",
    ],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(mieterData);

  ws1["!cols"] = [
    { wch: 10 },  // Nummer
    { wch: 20 },  // Name
    { wch: 22 },  // Wohnungsbezeichnung
    { wch: 12 },  // Fläche
    { wch: 12 },  // Kaltmiete/m²
    { wch: 12 },  // Kaltmiete
    { wch: 20 },  // Kalte BK
    { wch: 12 },  // Heizkosten
    { wch: 14 },  // Befristung
    { wch: 8 },   // USt.
    { wch: 18 },  // Bruttogesamtmiete
    { wch: 14 },  // Einzugsdatum
    { wch: 20 },  // Besonderheit
    { wch: 10 },  // Gewerbe
    { wch: 30 },  // WG-Typ
  ];

  XLSX.utils.book_append_sheet(wb, ws1, "Mieterliste");

  // Tab 2: Ehemalige Mieter
  const ehemaligenData = [
    [
      "Nummer",
      "Name",
      "Wohnungsbezeichnung",
      "Kaltmiete",
      "Kalte Betriebskosten",
      "Heizkosten",
      "USt.",
      "Einzugsdatum",
      "Auszugsdatum",
      "Kaution verbleibend",
      "Mietschulden",
    ],
    [
      "M000",
      "Erika Beispiel",
      "VH 2. OG rechts",
      480,
      75,
      65,
      0,
      "01.01.2020",
      "31.12.2024",
      500,
      0,
    ],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(ehemaligenData);

  ws2["!cols"] = [
    { wch: 10 },
    { wch: 20 },
    { wch: 22 },
    { wch: 12 },
    { wch: 20 },
    { wch: 12 },
    { wch: 8 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 14 },
  ];

  XLSX.utils.book_append_sheet(wb, ws2, "Ehemalige Mieter");

  // Tab 3: Zahlungsliste (leer, nur Header)
  const zahlungData = [
    [
      "Nr.",
      "Name",
      "Wohnung",
      "Soll/Monat",
      "Übertrag Vorjahr",
      "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
      "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
      "Summe Ist",
      "Jahres-Saldo",
    ],
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(zahlungData);

  ws3["!cols"] = [
    { wch: 6 }, { wch: 22 }, { wch: 20 }, { wch: 13 }, { wch: 13 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 13 }, { wch: 13 },
  ];

  XLSX.utils.book_append_sheet(wb, ws3, "Zahlungsliste");

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Uint8Array(buf);
}

// ============================================================
// Import-Datentyp für einen Mieter
// ============================================================

export interface MieterImportRow {
  number: string | null;
  name: string;
  unit_label: string;
  area_sqm: number | null;
  rent_per_sqm: number | null;
  rent_cold: number | null;
  utilities_cold: number | null;
  heating_costs: number | null;
  vat: number | null;
  rent_total: number;
  move_in_date: string | null;
  // Neue Felder
  lease_end: string | null;       // Befristung (Datum oder "unbefristet")
  is_commercial: boolean;         // Gewerbe ja/nein
  wg_type: string | null;         // "A", "B", "C" oder null
  notes: string | null;           // Besonderheit/Bemerkungen
}

// ============================================================
// Hilfsfunktion: Datum parsen (verschiedene Formate)
// ============================================================

function parseDate(value: unknown): string | null {
  if (!value) return null;

  // Excel Date-Objekt
  if (value instanceof Date) {
    const day = String(value.getDate()).padStart(2, "0");
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const year = value.getFullYear();
    return `${year}-${month}-${day}`;
  }

  const str = String(value).trim();
  if (!str) return null;

  // DD.MM.YYYY
  const deMatch = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (deMatch) {
    const day = deMatch[1].padStart(2, "0");
    const month = deMatch[2].padStart(2, "0");
    const year = deMatch[3];
    return `${year}-${month}-${day}`;
  }

  // YYYY-MM-DD (mit optionaler Uhrzeit)
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // Excel serial number
  const num = Number(value);
  if (!isNaN(num) && num > 30000 && num < 60000) {
    const date = new Date((num - 25569) * 86400 * 1000);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${year}-${month}-${day}`;
  }

  return null;
}

// ============================================================
// Hilfsfunktion: Befristung parsen
// Kann ein Datum sein oder "unbefristet"
// ============================================================

function parseLease(value: unknown): string | null {
  if (!value) return null;
  const str = String(value).trim().toLowerCase();
  if (str === "unbefristet") return "unbefristet";

  // Versuche als Datum zu parsen
  const dateResult = parseDate(value);
  if (dateResult) return dateResult;

  // Wenn es ein anderer Text ist, als String übernehmen
  return String(value).trim() || null;
}

// ============================================================
// Hilfsfunktion: WG-Typ aus Dropdown-Text extrahieren
// Input kann "A - Einzelverträge pro Zimmer" oder nur "A" sein
// ============================================================

function parseWgType(value: unknown): string | null {
  if (!value) return null;
  const str = String(value).trim();
  if (!str) return null;

  // Wenn es mit A, B oder C anfängt, den Buchstaben nehmen
  const match = str.match(/^([ABC])/i);
  if (match) return match[1].toUpperCase();

  return null;
}

// ============================================================
// Hilfsfunktion: Gewerbe-Flag parsen
// ============================================================

function parseCommercial(value: unknown): boolean {
  if (!value) return false;
  const str = String(value).trim().toLowerCase();
  return str === "ja" || str === "yes" || str === "true" || str === "1";
}

// ============================================================
// Mieterliste parsen (erstes Sheet der Excel-Datei)
// ============================================================

export function parseMieterliste(file: ArrayBuffer): {
  rows: MieterImportRow[];
  errors: string[];
} {
  const wb = XLSX.read(file, { type: "array" });

  // Sheet "Mieterliste" gezielt lesen (nicht einfach das erste Sheet)
  const sheetName = wb.SheetNames.find(s => s.toLowerCase().includes("mieterliste")) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

  const rows: MieterImportRow[] = [];
  const errors: string[] = [];

  rawData.forEach((row, index) => {
    const rowNum = index + 2;

    // Flexible Spaltenerkennung für Pflichtfelder
    const name =
      (row["Name"] as string) ||
      (row["name"] as string) ||
      (row["Mieter"] as string) ||
      "";
    const unitLabel =
      (row["Wohnungsbezeichnung"] as string) ||
      (row["Wohnung"] as string) ||
      (row["Einheit"] as string) ||
      "";

    // Name mit ↳-Prefix bereinigen (WG-Mitglieder aus unserer Vorlage)
    const cleanName = name.replace(/^\s*↳\s*/, "").trim();

    if (!cleanName) {
      // Leere Zeilen oder "Leerstand" ohne Name überspringen
      return;
    }
    if (!unitLabel.trim()) {
      errors.push(`Zeile ${rowNum}: Wohnungsbezeichnung fehlt für "${cleanName}"`);
      return;
    }

    // Bruttogesamtmiete: kann eine Formel sein (wird dann als 0 gelesen)
    // In dem Fall berechnen wir sie aus den Einzelwerten
    let rentTotalRaw = row["Bruttogesamtmiete"] || row["Gesamtmiete"] || row["Bruttomiete"] || 0;
    let rentTotal = parseFloat(String(rentTotalRaw)) || 0;

    // Wenn Bruttogesamtmiete 0 ist aber Einzelwerte vorhanden → selbst berechnen
    if (rentTotal <= 0) {
      const cold = parseFloat(String(row["Kaltmiete"] || 0)) || 0;
      const bk = parseFloat(String(row["Kalte Betriebskosten"] || row["Betriebskosten"] || row["NK"] || 0)) || 0;
      const hk = parseFloat(String(row["Heizkosten"] || row["HK"] || 0)) || 0;
      const ust = parseFloat(String(row["USt."] || row["USt"] || row["MwSt"] || 0)) || 0;
      const calculated = cold + bk + hk + ust;
      if (calculated > 0) {
        rentTotal = calculated;
      }
    }

    // Leerstand erkennen
    const isLeerstand = cleanName.toLowerCase() === "leerstand";

    // Gewerbe-Flag und WG-Typ schon hier lesen (brauchen wir für Validierung)
    const isCommercial = parseCommercial(row["Gewerbe"] || null);
    const wgType = parseWgType(row["WG-Typ"] || row["WG Typ"] || null);

    // Bei Gewerbemietern: USt. selbst berechnen wenn sie eine Formel ist
    if (isCommercial && rentTotal > 0) {
      const cold = parseFloat(String(row["Kaltmiete"] || 0)) || 0;
      const bk = parseFloat(String(row["Kalte Betriebskosten"] || row["Betriebskosten"] || 0)) || 0;
      const hk = parseFloat(String(row["Heizkosten"] || row["HK"] || 0)) || 0;
      const ustRaw = parseFloat(String(row["USt."] || row["USt"] || 0)) || 0;
      // Wenn USt. 0 ist aber Gewerbe → 19% berechnen
      if (ustRaw <= 0 && cold > 0) {
        const ustCalc = (cold + bk + hk) * 0.19;
        rentTotal = cold + bk + hk + ustCalc;
      }
    }

    // Bei echten Mietern (nicht Leerstand, nicht WG-Sub) muss Miete > 0 sein
    if (!isLeerstand && rentTotal <= 0) {
      // WG-Mitbewohner Typ B/C ohne eigene Miete ist OK
      if (!wgType || wgType === "A") {
        errors.push(`Zeile ${rowNum}: Bruttogesamtmiete fehlt oder ist 0 für "${cleanName}"`);
        return;
      }
    }

    const moveInDate = parseDate(
      row["Einzugsdatum"] || row["Einzug"] || row["Mietbeginn"] || null
    );

    rows.push({
      number: String(row["Nummer"] || row["Nr."] || row["Nr"] || "") || null,
      name: cleanName,
      unit_label: unitLabel.trim(),
      area_sqm:
        parseFloat(String(row["Fläche (m²)"] || row["Fläche"] || row["m²"] || 0)) || null,
      rent_per_sqm:
        parseFloat(String(row["Kaltmiete/m²"] || row["Kaltmiete/qm"] || 0)) || null,
      rent_cold: parseFloat(String(row["Kaltmiete"] || 0)) || null,
      utilities_cold:
        parseFloat(String(row["Kalte Betriebskosten"] || row["Betriebskosten"] || row["NK"] || 0)) || null,
      heating_costs:
        parseFloat(String(row["Heizkosten"] || row["HK"] || 0)) || null,
      vat:
        parseFloat(String(row["USt."] || row["USt"] || row["MwSt"] || 0)) || 
        (isCommercial ? ((parseFloat(String(row["Kaltmiete"] || 0)) || 0) + 
          (parseFloat(String(row["Kalte Betriebskosten"] || row["Betriebskosten"] || 0)) || 0) + 
          (parseFloat(String(row["Heizkosten"] || row["HK"] || 0)) || 0)) * 0.19 : null),
      rent_total: rentTotal,
      move_in_date: moveInDate,
      // Neue Felder
      lease_end: parseLease(row["Befristung"] || row["Vertragslaufzeit"] || null),
      is_commercial: isCommercial,
      wg_type: wgType,
      notes: String(row["Besonderheit"] || row["Bemerkungen"] || row["Notizen"] || "").trim() || null,
    });
  });

  return { rows, errors };
}
