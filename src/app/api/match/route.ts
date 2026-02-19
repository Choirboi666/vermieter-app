import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

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
      { error: "Fehler beim Matching: " + (error as Error).message },
      { status: 500 }
    );
  }
}

async function matchTransactions(
  transactions: RawTransaction[],
  tenants: Tenant[]
): Promise<MatchResult[]> {
  // Mieterliste als Text für den Prompt
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

Ordne jede Transaktion einem Mieter zu. Nutze folgende Regeln:
1. Vergleiche den Absender-Namen und Verwendungszweck mit den Mieternamen
2. Prüfe ob die Mieternummer im Verwendungszweck vorkommt
3. Vergleiche den Betrag mit der erwarteten Miete
4. Bei Namensähnlichkeit (z.B. "Mueller" = "Müller", Vorname/Nachname vertauscht) trotzdem zuordnen

Antworte NUR mit einem JSON-Array. Jedes Element hat:
- "index": Nummer der Transaktion [0, 1, 2, ...]
- "tenant_id": Die ID des Mieters (oder null wenn keine Zuordnung möglich)
- "confidence": Zahl zwischen 0 und 1 (0.9+ = sicher, 0.6-0.9 = wahrscheinlich, unter 0.6 = unklar)
- "reason": Kurze deutsche Begründung (z.B. "Name 'Müller' im Verwendungszweck, Betrag passt")

Antworte NUR mit dem JSON-Array, keine Erklärungen davor oder danach.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  // Parse Claude's response
  const responseText =
    message.content[0].type === "text" ? message.content[0].text : "";

  let matches: { index: number; tenant_id: string | null; confidence: number; reason: string }[];

  try {
    // Versuche JSON aus der Antwort zu extrahieren
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      matches = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("Kein JSON in der Antwort gefunden");
    }
  } catch {
    console.error("Failed to parse Claude response:", responseText);
    // Fallback: Alle als unklar markieren
    matches = transactions.map((_: RawTransaction, i: number) => ({
      index: i,
      tenant_id: null,
      confidence: 0,
      reason: "AI-Antwort konnte nicht verarbeitet werden",
    }));
  }

  // Ergebnisse zusammenbauen
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
