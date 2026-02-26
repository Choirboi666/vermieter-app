// ============================================================
// Saldo-basierte Mietberechnung (§366 BGB)
//
// Zahlungen werden nicht einem bestimmten Monat zugeordnet,
// sondern auf das laufende Konto angerechnet.
// Älteste offene Forderung wird zuerst bedient.
// ============================================================

export interface Transaction {
  id: string;
  tenant_id: string | null;
  date: string;
  amount: number;
  purpose_raw: string;
  confidence: number;
  match_reason: string;
  status: string;
  month_period: string;
}

export interface MonthStatus {
  month: string;           // YYYY-MM
  soll: number;            // Monatliche Sollmiete
  covered: number;         // Wie viel von diesem Monat gedeckt ist
  status: "paid" | "partial" | "open";  // Zahlungsstatus
  payments: Transaction[]; // Zahlungen die in diesem Kalendermonat eingingen
}

export interface TenantSaldo {
  months: MonthStatus[];   // Alle Monate chronologisch
  totalSoll: number;       // Gesamt-Soll über alle Monate
  totalPaid: number;       // Gesamt eingegangene Zahlungen
  saldo: number;           // Aktuelles Saldo (positiv = Guthaben, negativ = Schulden)
  currentMonthStatus: "paid" | "partial" | "open" | "no_data";
  lastClosedMonthStatus: "paid" | "partial" | "open" | "no_data"; // Vormonat
  saldoExcludingCurrent: number; // Saldo ohne aktuellen Monat (nur abgeschlossene Monate)
}

// ============================================================
// Alle Monate zwischen zwei YYYY-MM Strings generieren
// ============================================================
function generateMonths(from: string, to: string): string[] {
  const months: string[] = [];
  const [fromYear, fromMonth] = from.split("-").map(Number);
  const [toYear, toMonth] = to.split("-").map(Number);

  let y = fromYear;
  let m = fromMonth;

  while (y < toYear || (y === toYear && m <= toMonth)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }

  return months;
}

// ============================================================
// Aktuellen Monat als YYYY-MM
// ============================================================
export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ============================================================
// Monat formatieren für Anzeige
// ============================================================
export function formatMonth(period: string): string {
  const names = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  const [year, month] = period.split("-");
  return `${names[parseInt(month) - 1]} ${year}`;
}

// ============================================================
// Monat formatieren für Anzeige (lang)
// ============================================================
export function formatMonthLong(period: string): string {
  const names = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const [year, month] = period.split("-");
  return `${names[parseInt(month) - 1]} ${year}`;
}

// ============================================================
// Vormonat berechnen
// ============================================================
export function getPreviousMonth(period?: string): string {
  const ref = period || getCurrentMonth();
  const [y, m] = ref.split("-").map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

// ============================================================
// Effektiver Monat einer Zahlung (25er-Regel):
// Zahlungen ab dem 25. eines Monats werden dem Folgemonat
// zugeordnet, da Mieter häufig Ende des Monats für den
// Folgemonat zahlen.
// ============================================================
export function getEffectiveMonth(dateStr: string): string {
  const day = parseInt(dateStr.substring(8, 10));
  if (day >= 25) {
    const [y, m] = dateStr.substring(0, 7).split("-").map(Number);
    if (m === 12) return `${y + 1}-01`;
    return `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  return dateStr.substring(0, 7);
}

// ============================================================
// Saldo für einen Mieter berechnen
//
// Logik:
// 1. Bestimme den Zeitraum: vom Einzug (oder erster Zahlung)
//    bis zum aktuellen Monat
// 2. Für jeden Monat entsteht eine Soll-Forderung
// 3. Alle Zahlungen werden chronologisch aufsummiert
// 4. Die Gesamtsumme der Zahlungen wird auf die Monate
//    angerechnet, ältester zuerst (§366 BGB)
// ============================================================
export function calcTenantSaldo(
  tenantId: string,
  rentTotal: number,
  moveInDate: string | null,
  allTransactions: Transaction[],
  earliestDataMonth?: string, // Frühester Monat mit importierten Daten (für das Objekt)
  latestDataMonth?: string, // Letzter Monat mit Importdaten – Soll nur bis hier generieren
  wgMemberIds?: string[], // Bei WG Typ B/C: IDs aller WG-Mitglieder deren Zahlungen zusammengerechnet werden
  rentReductions?: Map<string, number>, // month → Minderungsbetrag
): TenantSaldo {
  const currentMonth = getCurrentMonth();
  // Soll bis zum letzten importierten Monat + 1 (weil 25er-Regel Zahlungen
  // in den Folgemonat verschiebt), maximal currentMonth
  let sollEndMonth = currentMonth;
  if (latestDataMonth && latestDataMonth < currentMonth) {
    // Einen Monat nach dem letzten Importmonat, damit 25er-Regel-Zahlungen landen können
    const [ly, lm] = latestDataMonth.split("-").map(Number);
    const nextMonth = lm === 12 ? `${ly + 1}-01` : `${ly}-${String(lm + 1).padStart(2, "0")}`;
    sollEndMonth = nextMonth < currentMonth ? nextMonth : currentMonth;
  }

  // Alle Zahlungen dieses Mieters (bzw. aller WG-Mitglieder), chronologisch sortiert
  const filterIds = wgMemberIds && wgMemberIds.length > 0
    ? new Set(wgMemberIds)
    : new Set([tenantId]);
  const tenantTx = allTransactions
    .filter((t) => t.tenant_id !== null && filterIds.has(t.tenant_id))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalPaid = tenantTx.reduce((sum, t) => sum + t.amount, 0);

  // Startmonat: Der spätere von (frühester Datenmonat) und (Einzugsdatum)
  // Wir berechnen Soll erst ab dem Zeitpunkt, ab dem wir Daten haben.
  // Alles davor gilt als ausgeglichen (Saldo = 0).
  let startMonth: string | null = null;

  // Basis: frühester Monat mit importierten Transaktionen für dieses Objekt
  if (earliestDataMonth) {
    startMonth = earliestDataMonth;
  }

  // Wenn der Mieter erst nach dem frühesten Datenmonat eingezogen ist,
  // startet die Rechnung erst ab Einzug
  if (moveInDate) {
    const moveMonth = moveInDate.substring(0, 7);
    if (!startMonth || moveMonth > startMonth) {
      startMonth = moveMonth;
    }
  }

  // Fallback: erster Zahlungsmonat dieses Mieters
  if (!startMonth && tenantTx.length > 0) {
    startMonth = tenantTx[0].date.substring(0, 7);
  }

  // Kein Startmonat bekannt → keine Daten
  if (!startMonth) {
    return {
      months: [],
      totalSoll: 0,
      totalPaid: 0,
      saldo: 0,
      currentMonthStatus: "no_data",
    };
  }

  // Wenn Startmonat nach aktuellem Monat liegt
  if (startMonth > currentMonth) {
    return {
      months: [],
      totalSoll: 0,
      totalPaid,
      saldo: totalPaid,
      currentMonthStatus: "no_data",
    };
  }

  // Alle Monate vom Start bis zum letzten Importmonat generieren
  const allMonths = generateMonths(startMonth, sollEndMonth);
  const totalSoll = allMonths.reduce((sum, month) => {
    const reduction = rentReductions?.get(month) || 0;
    return sum + Math.max(0, rentTotal - reduction);
  }, 0);

  // Zahlungen nach effektivem Monat gruppieren (25er-Regel für Anzeige)
  const paymentsByEffectiveMonth = new Map<string, Transaction[]>();
  tenantTx.forEach((tx) => {
    const effMonth = getEffectiveMonth(tx.date);
    const existing = paymentsByEffectiveMonth.get(effMonth) || [];
    existing.push(tx);
    paymentsByEffectiveMonth.set(effMonth, existing);
  });

  // §366 BGB: Zahlungen auf älteste Schuld anrechnen
  // Wir gehen Monat für Monat durch und "verbrauchen" das Guthaben
  let remainingCredit = totalPaid;
  const months: MonthStatus[] = allMonths.map((month) => {
    const reduction = rentReductions?.get(month) || 0;
    const soll = Math.max(0, rentTotal - reduction);
    let covered = 0;

    if (remainingCredit >= soll) {
      // Monat vollständig gedeckt
      covered = soll;
      remainingCredit -= soll;
    } else if (remainingCredit > 0) {
      // Monat teilweise gedeckt
      covered = remainingCredit;
      remainingCredit = 0;
    }
    // else: covered bleibt 0

    const status: MonthStatus["status"] =
      covered >= soll ? "paid" : covered > 0 ? "partial" : "open";

    return {
      month,
      soll,
      covered,
      status,
      payments: paymentsByEffectiveMonth.get(month) || [],
    };
  });

  // Aktueller Monat Status
  const currentMonthData = months.find((m) => m.month === currentMonth);
  const currentMonthStatus = currentMonthData?.status || "no_data";

  // Vormonat (letzter abgeschlossener Monat) Status
  const prevMonth = getPreviousMonth(currentMonth);
  const prevMonthData = months.find((m) => m.month === prevMonth);
  const lastClosedMonthStatus = prevMonthData?.status || "no_data";

  // Saldo ohne aktuellen Monat (nur abgeschlossene Monate)
  const closedMonths = months.filter((m) => m.month < currentMonth);
  const closedSoll = closedMonths.reduce((s, m) => s + m.soll, 0);
  const saldoExcludingCurrent = totalPaid - closedSoll;

  return {
    months,
    totalSoll,
    totalPaid,
    saldo: totalPaid - totalSoll,
    currentMonthStatus,
    lastClosedMonthStatus,
    saldoExcludingCurrent,
  };
}

// ============================================================
// Individuelle Zahlungen eines WG-Mitglieds pro Monat berechnen
// (für Anzeige in hellgrau bei Typ B/C Mitgliedern)
// ============================================================
export function calcMemberPayments(
  tenantId: string,
  allTransactions: Transaction[],
): Map<string, number> {
  const result = new Map<string, number>();
  const memberTx = allTransactions
    .filter((t) => t.tenant_id === tenantId)
    .sort((a, b) => a.date.localeCompare(b.date));
  
  memberTx.forEach((tx) => {
    const effMonth = getEffectiveMonth(tx.date);
    result.set(effMonth, (result.get(effMonth) || 0) + tx.amount);
  });
  
  return result;
}
