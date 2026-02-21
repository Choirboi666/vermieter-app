import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import PDFParser from "pdf2json";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface Tenant {
  id: string;
  number: string | null;
  name: string;
  unit_label: string;
  rent_total: number;
}

interface RawTransaction {
  date: string;
  amount: number;
  purpose: string;
  sender: string;
}

interface MatchResult {
  date: string;
  amount: number;
  purpose: string;
  sender: string;
  tenant_id: string | null;
  tenant_name: string | null;
  confidence: number;
  match_reason: string;
  status: "matched" | "unclear" | "missing";
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    // PDF-Upload: multipart/form-data
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const pdfFile = formData.get("pdf") as File;
      const tenantsJson = formData.get("tenants") as string;

      if (!pdfFile || !tenantsJson) {
        return NextResponse.json(
          { error: "PDF und Mieter werden benötigt" },
          { status: 400 }
        );
      }

      const tenants: Tenant[] = JSON.parse(tenantsJson);
      const arrayBuffer = await pdfFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // PDF-Text extrahieren
      const pdfText = await new Promise<string>((resolve, reject) => {
        const pdfParser = new PDFParser();
        pdfParser.on("pdfParser_dataError", (err: {parserError: string}) => reject(new Error(err.parserError)));
        pdfParser.on("pdfParser_dataReady", (data: {Pages: Array<{Texts: Array<{R: Array<{T: string}>}>}>}) => {
          const text = data.Pages.map(page =>
            page.Texts.map(t => t.R.map(r => decodeURIComponent(r.T)).join("")).join(" ")
          ).join("\n");
          resolve(text);
        });
        pdfParser.parseBuffer(buffer);
      });
      

      if (!pdfText || pdfText.trim().length < 50) {
        return NextResponse.json(
          { error: "PDF konnte nicht gelesen werden oder ist leer. Ist es ein digitaler Bankauszug (kein Scan)?" },
          { status: 400 }
        );
      }

      // Schritt 1: Claude extrahiert Transaktionen aus PDF-Text
      const transactions = await extractTransactionsFromPDF(pdfText);

      if (transactions.length === 0) {
        return NextResponse.json(
          { error: "Keine Zahlungseingänge im PDF gefunden." },
          { status: 400 }
        );
      }

      // Schritt 2: Claude matched Transaktionen zu Mietern
      const results = await matchTransactions(transactions, tenants);
      return NextResponse.json({ results, transactionCount: transactions.length });
    }

    // CSV/XLSX-Upload: JSON body (bisheriger Flow)
    const { transactions, tenants } = await request.json();
    if (!transactions || !tenants) {
      return NextResponse.json(
        { error: "Transaktionen und Mieter werden benötigt" },
        { status: 400 }
      );
    }
    const results = await matchTransactions(transactions, tenants);
    return NextResponse.json({ results });

  } catch (error) {
    console.error("Matching error:", error);
    return NextResponse.json(
      { error: "Fehler: " + (error as Error).message },
      { status: 500 }
    );
  }
}

async function extractTransactionsFromPDF(pdfText: string): Promise<RawTransaction[]> {
  const prompt = `Du bist ein Spezialist für deutsche Bankauszüge. Extrahiere alle Zahlungseingänge (Gutschriften, positive Beträge) aus folgendem Bankauszug-Text.

WICHTIG:
- Nur Zahlungseingänge (Geld das aufs Konto kommt), KEINE Ausgaben
- Ausgaben erkennst du an: "zu Ihren Lasten", negativen Beträgen, Lastschriften die du bezahlst
- Eingänge erkennst du an: "zu Ihren Gunsten", SEPA-GUTSCHRIFT, ÜBERWEISUNG (eingehend), positiven Beträgen

Bankauszug-Text:
${pdfText.substring(0, 15000)}

Antworte NUR mit einem JSON-Array. Jedes Element hat:
- "date": Datum im Format YYYY-MM-DD
- "amount": Betrag als Zahl (positiv, z.B. 850.00)
- "sender": Name des Absenders/Auftraggebers
- "purpose": Verwendungszweck

Beispiel: [{"date":"2025-01-02","amount":850.00,"sender":"Max Mustermann","purpose":"Miete Januar 2025 Wohnung 2 OG"}]

Antworte NUR mit dem JSON-Array, kein Text davor oder danach.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 3000,
    messages: [{ role: "user", content: prompt }],
  });

  const responseText =
    message.content[0].type === "text" ? message.content[0].text : "";

  try {
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    console.error("Failed to parse transactions from PDF:", responseText);
  }

  return [];
}

async function matchTransactions(
  transactions: RawTransaction[],
  tenants: Tenant[]
): Promise<MatchResult[]> {
  const tenantList = tenants
    .map(
      (t) =>
        `ID: ${t.id} | Nr: ${t.number || "–"} | Name: ${t.name} | Wohnung: ${t.unit_label} | Miete: ${t.rent_total} EUR`
    )
    .join("\n");

  const transactionList = transactions
    .map(
      (t: RawTransaction, i: number) =>
        `[${i}] Datum: ${t.date} | Betrag: ${t.amount} EUR | Absender: ${t.sender} | Verwendungszweck: ${t.purpose}`
    )
    .join("\n");

  const prompt = `Du bist ein Assistent für Mietverwaltung. Deine Aufgabe ist es, Banktransaktionen den richtigen Mietern zuzuordnen.

Hier ist die Mieterliste:
${tenantList}

Hier sind die Banktransaktionen:
${transactionList}

Ordne jede Transaktion einem Mieter zu. Regeln:
1. Vergleiche Absender-Name und Verwendungszweck mit Mieternamen
2. Prüfe ob die Mieternummer im Verwendungszweck vorkommt
3. Vergleiche den Betrag mit der erwarteten Miete
4. Bei Namensähnlichkeit (Mueller = Müller, Vorname/Nachname vertauscht) trotzdem zuordnen

Antworte NUR mit einem JSON-Array. Jedes Element hat:
- "index": Nummer der Transaktion [0, 1, 2, ...]
- "tenant_id": Die ID des Mieters (oder null)
- "confidence": Zahl zwischen 0 und 1
- "reason": Kurze deutsche Begründung

Antworte NUR mit dem JSON-Array.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const responseText =
    message.content[0].type === "text" ? message.content[0].text : "";

  let matches: { index: number; tenant_id: string | null; confidence: number; reason: string }[];

  try {
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      matches = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("Kein JSON gefunden");
    }
  } catch {
    matches = transactions.map((_: RawTransaction, i: number) => ({
      index: i,
      tenant_id: null,
      confidence: 0,
      reason: "AI-Antwort konnte nicht verarbeitet werden",
    }));
  }

  const results: MatchResult[] = transactions.map(
    (tx: RawTransaction, i: number) => {
      const match = matches.find((m) => m.index === i) || {
        tenant_id: null,
        confidence: 0,
        reason: "Keine Zuordnung",
      };

      const tenant = tenants.find((t) => t.id === match.tenant_id);

      let status: "matched" | "unclear" | "missing";
      if (match.tenant_id && match.confidence >= 0.7) {
        status = "matched";
      } else if (match.tenant_id && match.confidence > 0) {
        status = "unclear";
      } else {
        status = "missing";
      }

      return {
        date: tx.date,
        amount: tx.amount,
        purpose: tx.purpose,
        sender: tx.sender,
        tenant_id: match.tenant_id,
        tenant_name: tenant?.name || null,
        confidence: match.confidence,
        match_reason: match.reason,
        status,
      };
    }
  );

  return results;
}