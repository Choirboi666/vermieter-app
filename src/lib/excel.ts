import * as XLSX from "xlsx";

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
      "USt.",
      "Bruttogesamtmiete",
      "Einzugsdatum",
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
      0,
      650,
      "01.08.2023",
    ],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(mieterData);

  ws1["!cols"] = [
    { wch: 10 },
    { wch: 20 },
    { wch: 22 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 20 },
    { wch: 12 },
    { wch: 8 },
    { wch: 18 },
    { wch: 14 },
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
  ];

  XLSX.utils.book_append_sheet(wb, ws2, "Ehemalige Mieter");

  // Tab 3: Zahlungsliste
  const zahlungData = [
    [
      "Nummer",
      "Name",
      "Wohnungsbezeichnung",
      "Monat",
      "Soll-Betrag",
      "Ist-Betrag",
      "Differenz",
      "Saldo kumuliert",
    ],
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(zahlungData);

  ws3["!cols"] = [
    { wch: 10 },
    { wch: 20 },
    { wch: 22 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 16 },
  ];

  XLSX.utils.book_append_sheet(wb, ws3, "Zahlungsliste");

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Uint8Array(buf);
}

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
}

function parseDate(value: unknown): string | null {
  if (!value) return null;

  // Wenn es ein Date-Objekt ist (Excel speichert Daten oft so)
  if (value instanceof Date) {
    const day = String(value.getDate()).padStart(2, "0");
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const year = value.getFullYear();
    return `${year}-${month}-${day}`;
  }

  const str = String(value).trim();
  if (!str) return null;

  // Format: DD.MM.YYYY
  const deMatch = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (deMatch) {
    const day = deMatch[1].padStart(2, "0");
    const month = deMatch[2].padStart(2, "0");
    const year = deMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Format: YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return str;
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

export function parseMieterliste(file: ArrayBuffer): {
  rows: MieterImportRow[];
  errors: string[];
} {
  const wb = XLSX.read(file, { type: "array" });

  // Erstes Sheet lesen (Mieterliste)
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

  const rows: MieterImportRow[] = [];
  const errors: string[] = [];

  rawData.forEach((row, index) => {
    const rowNum = index + 2;

    // Flexible Spaltenerkennung
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
    const rentTotal = parseFloat(
      String(
        row["Bruttogesamtmiete"] ||
          row["Gesamtmiete"] ||
          row["Bruttomiete"] ||
          0
      )
    );

    if (!name.trim()) {
      errors.push(`Zeile ${rowNum}: Name fehlt`);
      return;
    }
    if (!unitLabel.trim()) {
      errors.push(`Zeile ${rowNum}: Wohnungsbezeichnung fehlt`);
      return;
    }
    if (!rentTotal || rentTotal <= 0) {
      errors.push(`Zeile ${rowNum}: Bruttogesamtmiete fehlt oder ist 0`);
      return;
    }

    const moveInDate = parseDate(
      row["Einzugsdatum"] || row["Einzug"] || row["Mietbeginn"] || null
    );

    rows.push({
      number: String(row["Nummer"] || row["Nr."] || row["Nr"] || "") || null,
      name: name.trim(),
      unit_label: unitLabel.trim(),
      area_sqm:
        parseFloat(
          String(row["Fläche (m²)"] || row["Fläche"] || row["m²"] || 0)
        ) || null,
      rent_per_sqm:
        parseFloat(
          String(row["Kaltmiete/m²"] || row["Kaltmiete/qm"] || 0)
        ) || null,
      rent_cold: parseFloat(String(row["Kaltmiete"] || 0)) || null,
      utilities_cold:
        parseFloat(
          String(
            row["Kalte Betriebskosten"] ||
              row["Betriebskosten"] ||
              row["NK"] ||
              0
          )
        ) || null,
      heating_costs:
        parseFloat(String(row["Heizkosten"] || row["HK"] || 0)) || null,
      vat:
        parseFloat(
          String(row["USt."] || row["USt"] || row["MwSt"] || 0)
        ) || null,
      rent_total: rentTotal,
      move_in_date: moveInDate,
    });
  });

  return { rows, errors };
}
