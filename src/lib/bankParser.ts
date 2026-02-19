import * as XLSX from "xlsx";

export interface RawTransaction {
  date: string;
  amount: number;
  purpose: string;
  sender: string;
}

export function parseBankCSV(file: ArrayBuffer): {
  transactions: RawTransaction[];
  errors: string[];
} {
  const transactions: RawTransaction[] = [];
  const errors: string[] = [];

  try {
    // XLSX kann auch CSV lesen
    const wb = XLSX.read(file, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

    if (rawData.length === 0) {
      errors.push("Keine Daten in der Datei gefunden");
      return { transactions, errors };
    }

    // Spalten erkennen - verschiedene Bank-Formate
    const firstRow = rawData[0];
    const columns = Object.keys(firstRow);

    // Spalten-Mapping versuchen
    const dateCol = findColumn(columns, [
      "Buchungstag",
      "Buchungsdatum",
      "Datum",
      "Valuta",
      "Wertstellung",
      "Date",
      "Buchung",
    ]);
    const amountCol = findColumn(columns, [
      "Betrag",
      "Betrag (EUR)",
      "Umsatz",
      "Betrag in EUR",
      "Amount",
    ]);
    const purposeCol = findColumn(columns, [
      "Verwendungszweck",
      "Buchungstext",
      "Beschreibung",
      "Vorgang/Verwendungszweck",
      "Purpose",
      "Info",
    ]);
    const senderCol = findColumn(columns, [
      "Auftraggeber/Begünstigter",
      "Beguenstigter/Zahlungspflichtiger",
      "Name",
      "Auftraggeber",
      "Begünstigter",
      "Sender",
      "Empfänger",
      "Zahlungspflichtiger",
    ]);

    if (!dateCol) errors.push("Spalte 'Buchungstag/Datum' nicht erkannt");
    if (!amountCol) errors.push("Spalte 'Betrag' nicht erkannt");
    if (!purposeCol && !senderCol)
      errors.push(
        "Weder 'Verwendungszweck' noch 'Auftraggeber' Spalte erkannt"
      );

    if (!dateCol || !amountCol) {
      errors.push(
        `Erkannte Spalten: ${columns.join(", ")}. Bitte prüfen Sie das Format.`
      );
      return { transactions, errors };
    }

    rawData.forEach((row, index) => {
      try {
        const dateRaw = String(row[dateCol] || "").trim();
        const amountRaw = String(row[amountCol] || "").trim();
        const purpose = String(row[purposeCol || ""] || "").trim();
        const sender = String(row[senderCol || ""] || "").trim();

        if (!dateRaw || !amountRaw) return;

        // Betrag parsen (deutsche Schreibweise: 1.234,56)
        const amount = parseGermanAmount(amountRaw);

        // Nur Haben-Buchungen (positive Beträge = Zahlungseingänge)
        if (amount <= 0) return;

        // Datum normalisieren
        const date = normalizeDate(dateRaw);
        if (!date) return;

        transactions.push({
          date,
          amount,
          purpose,
          sender,
        });
      } catch {
        errors.push(`Zeile ${index + 2}: Konnte nicht verarbeitet werden`);
      }
    });

    if (transactions.length === 0 && errors.length === 0) {
      errors.push(
        "Keine Zahlungseingänge (positive Beträge) in der Datei gefunden"
      );
    }
  } catch {
    errors.push(
      "Die Datei konnte nicht gelesen werden. Ist es eine gültige CSV/Excel-Datei?"
    );
  }

  return { transactions, errors };
}

function findColumn(
  columns: string[],
  candidates: string[]
): string | null {
  for (const candidate of candidates) {
    const found = columns.find(
      (col) => col.toLowerCase().trim() === candidate.toLowerCase().trim()
    );
    if (found) return found;
  }
  // Teilweise Übereinstimmung
  for (const candidate of candidates) {
    const found = columns.find((col) =>
      col.toLowerCase().includes(candidate.toLowerCase())
    );
    if (found) return found;
  }
  return null;
}

function parseGermanAmount(str: string): number {
  // Entferne Währungssymbole und Whitespace
  let clean = str.replace(/[€\s]/g, "").trim();

  // Deutsche Schreibweise: 1.234,56 → 1234.56
  if (clean.includes(",")) {
    clean = clean.replace(/\./g, "").replace(",", ".");
  }

  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function normalizeDate(dateStr: string): string | null {
  // DD.MM.YYYY
  const deMatch = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (deMatch) {
    const day = deMatch[1].padStart(2, "0");
    const month = deMatch[2].padStart(2, "0");
    let year = deMatch[3];
    if (year.length === 2) year = "20" + year;
    return `${year}-${month}-${day}`;
  }

  // YYYY-MM-DD
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return dateStr;

  // DD/MM/YYYY
  const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, "0");
    const month = slashMatch[2].padStart(2, "0");
    let year = slashMatch[3];
    if (year.length === 2) year = "20" + year;
    return `${year}-${month}-${day}`;
  }

  // Excel serial number
  const num = Number(dateStr);
  if (!isNaN(num) && num > 30000 && num < 60000) {
    const date = new Date((num - 25569) * 86400 * 1000);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${year}-${month}-${day}`;
  }

  return null;
}
