import * as XLSX from "xlsx";
import ExcelJS from "exceljs";

// ============================================================
// Excel-Vorlage generieren (wird beim Download erzeugt)
// ============================================================

export function generateMieterlisteTemplate(): Uint8Array {
  const wb = XLSX.utils.book_new();

  const mieterData = [
    [
      "Nummer", "Name", "Wohnungsbezeichnung", "Fläche (m²)", "Kaltmiete/m²",
      "Kaltmiete", "Kalte Betriebskosten", "Heizkosten", "Befristung", "USt.",
      "Bruttogesamtmiete", "Einzugsdatum", "Besonderheit", "Gewerbe", "WG-Typ",
    ],
    [
      "M001", "Max Mustermieter", "VH 2. OG rechts", 65, 7.69,
      500, 80, 70, "unbefristet", 0, 650, "01.08.2023", "", "Nein", "",
    ],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(mieterData);
  ws1["!cols"] = [
    { wch: 10 }, { wch: 22 }, { wch: 22 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 8 },
    { wch: 18 }, { wch: 14 }, { wch: 20 }, { wch: 10 }, { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, "Mieterliste");

  const ehemaligenData = [
    [
      "Nummer", "Name", "Wohnungsbezeichnung", "Kaltmiete",
      "Kalte Betriebskosten", "Heizkosten", "USt.", "Einzugsdatum",
      "Auszugsdatum", "Kaution verbleibend", "Mietschulden",
    ],
    [
      "M000", "Erika Beispiel", "VH 2. OG rechts", 480, 75, 65, 0,
      "01.01.2020", "31.12.2024", 500, 0,
    ],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(ehemaligenData);
  ws2["!cols"] = [
    { wch: 10 }, { wch: 22 }, { wch: 22 }, { wch: 12 }, { wch: 20 },
    { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws2, "Ehemalige Mieter");

  const zahlungData = [
    [
      "Nr.", "Name", "Wohnung", "Soll/Monat", "Übertrag\nVorjahr",
      "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
      "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
      "Summe\nIst", "Jahres-\nSaldo",
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

  const kontaktData = [
    [
      "Name", "Wohnungsbezeichnung", "Straße + Hausnummer", "PLZ", "Ort",
      "E-Mail", "Telefon 1", "Telefon 2",
    ],
    [
      "Max Mustermieter", "VH 2. OG rechts", "Beispielstraße 42", "10115",
      "Berlin", "max@beispiel.de", "030 12345678", "",
    ],
  ];
  const ws4 = XLSX.utils.aoa_to_sheet(kontaktData);
  ws4["!cols"] = [
    { wch: 22 }, { wch: 22 }, { wch: 28 }, { wch: 8 }, { wch: 16 },
    { wch: 28 }, { wch: 18 }, { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, ws4, "Kontakte");

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Uint8Array(buf);
}

// ============================================================
// Import-Datentypen
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
  lease_end: string | null;
  is_commercial: boolean;
  wg_type: string | null;
  notes: string | null;
}

export interface KontaktImportRow {
  name: string;
  unit_label: string;
  contact_street: string | null;
  contact_zip: string | null;
  contact_city: string | null;
  contact_email: string | null;
  contact_phone1: string | null;
  contact_phone2: string | null;
}

// ============================================================
// Hilfsfunktionen
// ============================================================

function parseDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    const day = String(value.getDate()).padStart(2, "0");
    const month = String(value.getMonth() + 1).padStart(2, "0");
    return `${value.getFullYear()}-${month}-${day}`;
  }
  const str = String(value).trim();
  if (!str) return null;
  const deMatch = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (deMatch) return `${deMatch[3]}-${deMatch[2].padStart(2, "0")}-${deMatch[1].padStart(2, "0")}`;
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const num = Number(value);
  if (!isNaN(num) && num > 30000 && num < 60000) {
    const date = new Date((num - 25569) * 86400 * 1000);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  return null;
}

function parseLease(value: unknown): string | null {
  if (!value) return null;
  const str = String(value).trim().toLowerCase();
  if (str === "unbefristet") return "unbefristet";
  return parseDate(value) || String(value).trim() || null;
}

function parseWgType(value: unknown): string | null {
  if (!value) return null;
  const str = String(value).trim();
  if (!str) return null;
  const match = str.match(/^([ABC])/i);
  return match ? match[1].toUpperCase() : null;
}

function parseCommercial(value: unknown): boolean {
  if (!value) return false;
  const str = String(value).trim().toLowerCase();
  return str === "ja" || str === "yes" || str === "true" || str === "1";
}

function formatDateDE(dateStr: string | null): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

// ============================================================
// Mieterliste parsen (Tab "Mieterliste")
// ============================================================

export function parseMieterliste(file: ArrayBuffer): {
  rows: MieterImportRow[];
  errors: string[];
} {
  const wb = XLSX.read(file, { type: "array" });
  const sheetName = wb.SheetNames.find(s => s.toLowerCase().includes("mieterliste")) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

  const rows: MieterImportRow[] = [];
  const errors: string[] = [];

  rawData.forEach((row, index) => {
    const rowNum = index + 2;
    const name = (row["Name"] as string) || (row["name"] as string) || (row["Mieter"] as string) || "";
    const unitLabel = (row["Wohnungsbezeichnung"] as string) || (row["Wohnung"] as string) || (row["Einheit"] as string) || "";
    const cleanName = name.replace(/^\s*↳\s*/, "").trim();
    if (!cleanName) return;
    if (!unitLabel.trim()) { errors.push(`Zeile ${rowNum}: Wohnungsbezeichnung fehlt für "${cleanName}"`); return; }

    let rentTotal = parseFloat(String(row["Bruttogesamtmiete"] || row["Gesamtmiete"] || row["Bruttomiete"] || 0)) || 0;
    if (rentTotal <= 0) {
      const cold = parseFloat(String(row["Kaltmiete"] || 0)) || 0;
      const bk = parseFloat(String(row["Kalte Betriebskosten"] || row["Betriebskosten"] || row["NK"] || 0)) || 0;
      const hk = parseFloat(String(row["Heizkosten"] || row["HK"] || 0)) || 0;
      const ust = parseFloat(String(row["USt."] || row["USt"] || row["MwSt"] || 0)) || 0;
      const calc = cold + bk + hk + ust;
      if (calc > 0) rentTotal = calc;
    }

    const isLeerstand = cleanName.toLowerCase() === "leerstand";
    const isCommercial = parseCommercial(row["Gewerbe"] || null);
    const wgType = parseWgType(row["WG-Typ"] || row["WG Typ"] || null);

    if (isCommercial && rentTotal > 0) {
      const cold = parseFloat(String(row["Kaltmiete"] || 0)) || 0;
      const bk = parseFloat(String(row["Kalte Betriebskosten"] || row["Betriebskosten"] || 0)) || 0;
      const hk = parseFloat(String(row["Heizkosten"] || row["HK"] || 0)) || 0;
      const ustRaw = parseFloat(String(row["USt."] || row["USt"] || 0)) || 0;
      if (ustRaw <= 0 && cold > 0) rentTotal = (cold + bk + hk) * 1.19;
    }

    if (!isLeerstand && rentTotal <= 0 && (!wgType || wgType === "A")) {
      errors.push(`Zeile ${rowNum}: Bruttogesamtmiete fehlt oder ist 0 für "${cleanName}"`);
      return;
    }

    rows.push({
      number: String(row["Nummer"] || row["Nr."] || row["Nr"] || "") || null,
      name: cleanName,
      unit_label: unitLabel.trim(),
      area_sqm: parseFloat(String(row["Fläche (m²)"] || row["Fläche"] || row["m²"] || 0)) || null,
      rent_per_sqm: parseFloat(String(row["Kaltmiete/m²"] || row["Kaltmiete/qm"] || 0)) || null,
      rent_cold: parseFloat(String(row["Kaltmiete"] || 0)) || null,
      utilities_cold: parseFloat(String(row["Kalte Betriebskosten"] || row["Betriebskosten"] || row["NK"] || 0)) || null,
      heating_costs: parseFloat(String(row["Heizkosten"] || row["HK"] || 0)) || null,
      vat: parseFloat(String(row["USt."] || row["USt"] || row["MwSt"] || 0)) ||
        (isCommercial ? ((parseFloat(String(row["Kaltmiete"] || 0)) || 0) +
          (parseFloat(String(row["Kalte Betriebskosten"] || row["Betriebskosten"] || 0)) || 0) +
          (parseFloat(String(row["Heizkosten"] || row["HK"] || 0)) || 0)) * 0.19 : null),
      rent_total: rentTotal,
      move_in_date: parseDate(row["Einzugsdatum"] || row["Einzug"] || row["Mietbeginn"] || null),
      lease_end: parseLease(row["Befristung"] || row["Vertragslaufzeit"] || null),
      is_commercial: isCommercial,
      wg_type: wgType,
      notes: String(row["Besonderheit"] || row["Bemerkungen"] || row["Notizen"] || "").trim() || null,
    });
  });

  return { rows, errors };
}

// ============================================================
// Kontaktliste parsen (Tab "Kontakte")
// ============================================================

export function parseKontaktliste(file: ArrayBuffer): {
  rows: KontaktImportRow[];
  errors: string[];
} {
  const wb = XLSX.read(file, { type: "array" });
  const sheetName = wb.SheetNames.find(s => s.toLowerCase().includes("kontakt"));
  if (!sheetName) return { rows: [], errors: [] };

  const ws = wb.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
  const rows: KontaktImportRow[] = [];
  const errors: string[] = [];

  rawData.forEach((row, index) => {
    const rowNum = index + 2;
    const name = String(row["Name"] || row["name"] || row["Mieter"] || "").trim();
    const unitLabel = String(row["Wohnungsbezeichnung"] || row["Wohnung"] || row["Einheit"] || "").trim();
    if (!name) return;
    if (!unitLabel) { errors.push(`Kontakte Zeile ${rowNum}: Wohnungsbezeichnung fehlt für "${name}"`); return; }

    rows.push({
      name, unit_label: unitLabel,
      contact_street: String(row["Straße + Hausnummer"] || row["Straße"] || row["Adresse"] || "").trim() || null,
      contact_zip: String(row["PLZ"] || row["Postleitzahl"] || "").trim() || null,
      contact_city: String(row["Ort"] || row["Stadt"] || row["City"] || "").trim() || null,
      contact_email: String(row["E-Mail"] || row["Email"] || row["email"] || "").trim() || null,
      contact_phone1: String(row["Telefon 1"] || row["Telefon"] || row["Tel"] || "").trim() || null,
      contact_phone2: String(row["Telefon 2"] || row["Tel 2"] || row["Mobil"] || "").trim() || null,
    });
  });

  return { rows, errors };
}

// ============================================================
// EXPORT mit ExcelJS: Formatiert, mit echten Formeln
// ============================================================

export interface ExportTenant {
  id: string;
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
  move_out_date: string | null;
  lease_end: string | null;
  is_commercial: boolean;
  wg_type: string | null;
  wg_main_tenant_id: string | null;
  notes: string | null;
  is_active: boolean;
  contact_street: string | null;
  contact_zip: string | null;
  contact_city: string | null;
  contact_email: string | null;
  contact_phone1: string | null;
  contact_phone2: string | null;
  starting_balance: number | null;
}

export interface ExportTransaction {
  tenant_id: string | null;
  date: string;
  amount: number;
  month_period: string;
}

// Styles
const HEADER_FILL: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F5496" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
const HEADER_ALIGN: Partial<ExcelJS.Alignment> = { horizontal: "center", vertical: "middle", wrapText: true };
const SUB_FONT: Partial<ExcelJS.Font> = { color: { argb: "FF4472C4" }, size: 10, italic: true };
const CURRENCY_FMT = "#,##0.00 €";
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD0D0D0" } },
  bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
  left: { style: "thin", color: { argb: "FFD0D0D0" } },
  right: { style: "thin", color: { argb: "FFD0D0D0" } },
};

function styleHeaderRow(ws: ExcelJS.Worksheet, colCount: number) {
  const headerRow = ws.getRow(1);
  headerRow.height = 30;
  for (let c = 1; c <= colCount; c++) {
    const cell = headerRow.getCell(c);
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = HEADER_ALIGN;
    cell.border = THIN_BORDER;
  }
}

function wgTypeLabel(t: ExportTenant): string {
  if (!t.wg_type) return "";
  switch (t.wg_type) {
    case "A": return "A - Einzelverträge pro Zimmer";
    case "B": return "B - Ein Vertrag einer zahlt";
    case "C": return "C - Ein Vertrag jeder zahlt Anteil";
    default: return t.wg_type;
  }
}

function formatLease(t: ExportTenant): string {
  if (!t.lease_end) return "";
  if (t.lease_end === "unbefristet") return "unbefristet";
  if (t.lease_end.match(/^\d{4}-\d{2}-\d{2}/)) return formatDateDE(t.lease_end);
  return t.lease_end;
}

export async function generateExport(
  objectName: string,
  allTenants: ExportTenant[],
  transactions: ExportTransaction[]
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();

  const active = allTenants.filter((t) => t.is_active);
  const former = allTenants.filter((t) => !t.is_active);

  // ── Sortierung: Hauptmieter + WG-Mitglieder ──
  const mainTenants = active.filter((t) => !t.wg_main_tenant_id);
  const subTenants = active.filter((t) => !!t.wg_main_tenant_id);

  const orderedTenants: ExportTenant[] = [];
  for (const main of mainTenants) {
    orderedTenants.push(main);
    const subs = subTenants.filter((s) => s.wg_main_tenant_id === main.id);
    for (const sub of subs) orderedTenants.push(sub);
  }

  // ── Jahre ──
  const allMonths = [...new Set(transactions.filter((t) => t.tenant_id).map((t) => t.month_period))].sort();
  const years = [...new Set(allMonths.map((m) => parseInt(m.split("-")[0])))].sort();
  if (years.length === 0) years.push(new Date().getFullYear());
  const monthNames = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

  // ═══════════════════════════════════════════
  // Tab: Übersicht
  // ═══════════════════════════════════════════
  const wsUeb = wb.addWorksheet("Übersicht");
  const uebHeaders = ["Nr.", "Name", "Wohnung", "Soll/Monat", ...years.map(y => `Saldo ${y}`), "Gesamt-\nSaldo"];
  wsUeb.addRow(uebHeaders);
  styleHeaderRow(wsUeb, uebHeaders.length);

  const zahlSheetNames = years.map(y => `Zahlungsliste ${y}`);

  for (let ti = 0; ti < orderedTenants.length; ti++) {
    const t = orderedTenants[ti];
    const r = ti + 2;
    const isSub = !!t.wg_main_tenant_id;
    const displayName = isSub ? `  ↳ ${t.name}` : t.name;
    const soll = isSub && t.wg_type === "B" ? 0 : t.rent_total;

    const row = wsUeb.addRow([t.number || "", displayName, t.unit_label, soll]);

    // Saldo-Formeln pro Jahr
    for (let yi = 0; yi < years.length; yi++) {
      const cell = row.getCell(5 + yi);
      cell.value = { formula: `'${zahlSheetNames[yi]}'!S${r}` } as any;
      cell.numFmt = CURRENCY_FMT;
    }
    // Gesamt-Saldo
    const gesamtCol = 5 + years.length;
    const startL = String.fromCharCode(69); // E
    const endL = String.fromCharCode(69 + years.length - 1);
    const gesamtCell = row.getCell(gesamtCol);
    if (years.length === 1) {
      gesamtCell.value = { formula: `E${r}` } as any;
    } else {
      gesamtCell.value = { formula: `${startL}${r}+${endL}${r}` } as any;
    }
    gesamtCell.numFmt = CURRENCY_FMT;

    // Soll formatieren
    row.getCell(4).numFmt = CURRENCY_FMT;

    // Sub-Mieter blau
    if (isSub) row.getCell(2).font = SUB_FONT;

    // Borders
    for (let c = 1; c <= uebHeaders.length; c++) row.getCell(c).border = THIN_BORDER;
  }

  wsUeb.columns = [
    { width: 7 }, { width: 32 }, { width: 22 }, { width: 14 },
    ...years.map(() => ({ width: 14 })), { width: 14 },
  ];

  // ═══════════════════════════════════════════
  // Tab: Mieterliste
  // ═══════════════════════════════════════════
  const wsMl = wb.addWorksheet("Mieterliste");
  const mlHeaders = [
    "Nummer", "Name", "Wohnungsbezeichnung", "Fläche (m²)", "Kaltmiete/m²",
    "Kaltmiete", "Kalte Betriebskosten", "Heizkosten", "Befristung", "USt.",
    "Bruttogesamtmiete", "Einzugsdatum", "Besonderheit", "Gewerbe", "WG-Typ",
  ];
  wsMl.addRow(mlHeaders);
  styleHeaderRow(wsMl, mlHeaders.length);

  for (let ti = 0; ti < orderedTenants.length; ti++) {
    const t = orderedTenants[ti];
    const r = ti + 2;
    const isSub = !!t.wg_main_tenant_id;
    const isSubB = isSub && t.wg_type === "B";
    const displayName = isSub ? `  ↳ ${t.name}` : t.name;

    const row = wsMl.addRow([
      t.number || "",          // A
      displayName,             // B
      t.unit_label,            // C
      isSubB ? null : (t.area_sqm || null), // D
      null,                    // E = Kaltmiete/m² (Formel)
      isSubB ? null : (t.rent_cold || null), // F
      isSubB ? null : (t.utilities_cold || null), // G
      isSubB ? null : (t.heating_costs || null), // H
      formatLease(t),          // I
      null,                    // J = USt. (Formel bei Gewerbe)
      null,                    // K = Bruttogesamtmiete (Formel)
      formatDateDE(t.move_in_date), // L
      t.notes || "",           // M
      t.is_commercial ? "Ja" : "", // N
      wgTypeLabel(t),          // O
    ]);

    // Kaltmiete/m² Formel
    if (!isSub && t.area_sqm && t.rent_cold) {
      row.getCell(5).value = { formula: `F${r}/D${r}` } as any;
      row.getCell(5).numFmt = "#,##0.00";
    }

    // USt. Formel bei Gewerbe
    if (!isSub && t.is_commercial && t.rent_cold) {
      const hasHK = t.heating_costs && t.heating_costs > 0;
      row.getCell(10).value = { formula: hasHK ? `0.19*(F${r}+G${r}+H${r})` : `0.19*(F${r}+G${r})` } as any;
      row.getCell(10).numFmt = CURRENCY_FMT;
    } else if (!isSub && t.vat) {
      row.getCell(10).value = t.vat;
      row.getCell(10).numFmt = CURRENCY_FMT;
    }

    // Bruttogesamtmiete Formel
    if (!isSubB && (t.rent_cold || 0) > 0) {
      row.getCell(11).value = { formula: `J${r}+H${r}+G${r}+F${r}` } as any;
      row.getCell(11).numFmt = CURRENCY_FMT;
    }

    // Formatierung
    row.getCell(6).numFmt = CURRENCY_FMT;
    row.getCell(7).numFmt = CURRENCY_FMT;
    row.getCell(8).numFmt = CURRENCY_FMT;
    if (isSub) row.getCell(2).font = SUB_FONT;
    for (let c = 1; c <= mlHeaders.length; c++) row.getCell(c).border = THIN_BORDER;
  }

  wsMl.columns = [
    { width: 10 }, { width: 32 }, { width: 22 }, { width: 12 }, { width: 12 },
    { width: 12 }, { width: 20 }, { width: 12 }, { width: 14 }, { width: 12 },
    { width: 18 }, { width: 14 }, { width: 28 }, { width: 10 }, { width: 34 },
  ];

  // ═══════════════════════════════════════════
  // Zahlungslisten pro Jahr
  // ═══════════════════════════════════════════
  for (let yi = 0; yi < years.length; yi++) {
    const year = years[yi];
    const sheetName = zahlSheetNames[yi];
    const wsZ = wb.addWorksheet(sheetName);

    const zHeaders = [
      "Nr.", "Name", "Wohnung", "Soll/Monat", "Übertrag\nVorjahr",
      ...monthNames, "Summe\nIst", "Jahres-\nSaldo",
    ];
    wsZ.addRow(zHeaders);
    styleHeaderRow(wsZ, zHeaders.length);

    for (let ti = 0; ti < orderedTenants.length; ti++) {
      const t = orderedTenants[ti];
      const r = ti + 2;
      const isSub = !!t.wg_main_tenant_id;
      const displayName = isSub ? `  ↳ ${t.name}` : t.name;
      const soll = isSub && t.wg_type === "B" ? 0 : t.rent_total;

      // Monatliche Beträge
      const monthAmounts: (number | null)[] = [];
      for (let m = 1; m <= 12; m++) {
        const monthKey = `${year}-${String(m).padStart(2, "0")}`;
        const txs = transactions.filter((tx) => tx.tenant_id === t.id && tx.month_period === monthKey);
        const sum = txs.reduce((s, tx) => s + tx.amount, 0);
        monthAmounts.push(sum > 0 ? sum : null);
      }

      const row = wsZ.addRow([
        t.number || "", displayName, t.unit_label, soll,
        null, // Übertrag (wird als Formel gesetzt)
        ...monthAmounts,
        null, // Summe Ist (Formel)
        null, // Jahres-Saldo (Formel)
      ]);

      // Übertrag Vorjahr
      if (yi > 0) {
        row.getCell(5).value = { formula: `'${zahlSheetNames[yi - 1]}'!S${r}` } as any;
      }
      row.getCell(5).numFmt = CURRENCY_FMT;

      // Summe Ist
      row.getCell(18).value = { formula: `SUM(F${r}:Q${r})` } as any;
      row.getCell(18).numFmt = CURRENCY_FMT;

      // Jahres-Saldo
      row.getCell(19).value = { formula: `R${r}-(D${r}*12)+IF(E${r}="",0,E${r})` } as any;
      row.getCell(19).numFmt = CURRENCY_FMT;

      // Soll + Monats-Beträge formatieren
      row.getCell(4).numFmt = CURRENCY_FMT;
      for (let m = 6; m <= 17; m++) row.getCell(m).numFmt = CURRENCY_FMT;

      if (isSub) row.getCell(2).font = SUB_FONT;
      for (let c = 1; c <= zHeaders.length; c++) row.getCell(c).border = THIN_BORDER;
    }

    wsZ.columns = [
      { width: 7 }, { width: 32 }, { width: 20 }, { width: 14 }, { width: 14 },
      { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 },
      { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 },
      { width: 14 }, { width: 14 },
    ];
  }

  // ═══════════════════════════════════════════
  // Tab: Ehemalige Mieter
  // ═══════════════════════════════════════════
  const wsEh = wb.addWorksheet("Ehemalige Mieter");
  const ehHeaders = [
    "Nummer", "Name", "Wohnungsbezeichnung", "Kaltmiete",
    "Kalte Betriebskosten", "Heizkosten", "USt.", "Einzugsdatum",
    "Auszugsdatum", "Kaution verbleibend", "Mietschulden",
  ];
  wsEh.addRow(ehHeaders);
  styleHeaderRow(wsEh, ehHeaders.length);

  for (const t of former) {
    const row = wsEh.addRow([
      t.number || "", t.name, t.unit_label,
      t.rent_cold || null, t.utilities_cold || null, t.heating_costs || null,
      t.vat || 0,
      formatDateDE(t.move_in_date), formatDateDE(t.move_out_date),
      null, t.starting_balance || 0,
    ]);
    row.getCell(4).numFmt = CURRENCY_FMT;
    row.getCell(5).numFmt = CURRENCY_FMT;
    row.getCell(6).numFmt = CURRENCY_FMT;
    row.getCell(11).numFmt = CURRENCY_FMT;
    for (let c = 1; c <= ehHeaders.length; c++) row.getCell(c).border = THIN_BORDER;
  }

  wsEh.columns = [
    { width: 10 }, { width: 30 }, { width: 22 }, { width: 12 }, { width: 20 },
    { width: 12 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 14 },
  ];

  // ═══════════════════════════════════════════
  // Tab: Kontakte
  // ═══════════════════════════════════════════
  const wsKo = wb.addWorksheet("Kontakte");
  const koHeaders = [
    "Name", "Wohnungsbezeichnung", "Straße + Hausnummer", "PLZ", "Ort",
    "E-Mail", "Telefon 1", "Telefon 2",
  ];
  wsKo.addRow(koHeaders);
  styleHeaderRow(wsKo, koHeaders.length);

  for (const t of active.filter(t => t.name.toLowerCase() !== "leerstand")) {
    const row = wsKo.addRow([
      t.name, t.unit_label, t.contact_street || "", t.contact_zip || "",
      t.contact_city || "", t.contact_email || "", t.contact_phone1 || "",
      t.contact_phone2 || "",
    ]);
    for (let c = 1; c <= koHeaders.length; c++) row.getCell(c).border = THIN_BORDER;
  }

  wsKo.columns = [
    { width: 24 }, { width: 22 }, { width: 30 }, { width: 10 }, { width: 18 },
    { width: 28 }, { width: 18 }, { width: 18 },
  ];

  // ── Freeze header row in all sheets ──
  wb.eachSheet((ws) => { ws.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }]; });

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
