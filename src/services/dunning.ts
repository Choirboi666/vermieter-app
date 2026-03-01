// =============================================================
// Mahnwesen-Service: Generiert DOCX-Mahnschreiben
// 3 Stufen: Zahlungserinnerung → 1. Mahnung → 2. Mahnung
// Kann von UI oder zukünftigem Agent aufgerufen werden
// =============================================================

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  BorderStyle,
  WidthType,
  ShadingType,
} from "docx";

// === Typen ===
export interface DunningInput {
  // Vermieter / Absender
  landlordName: string;
  landlordAddress: string;
  landlordCity: string;
  landlordPhone?: string;
  landlordEmail?: string;
  landlordIban: string;
  landlordBic?: string;
  // Mieter / Empfänger
  tenantName: string;
  tenantAddress?: string;
  // Objekt
  objectName: string;
  unitLabel: string;
  // Mahnung
  level: 1 | 2 | 3; // 1=Erinnerung, 2=1.Mahnung, 3=2.Mahnung
  totalDebt: number; // Gesamtrückstand
  monthsOpen: { month: string; soll: number; ist: number; diff: number }[];
  deadlineDays: number; // Frist in Tagen (Standard: 14)
}

export interface DunningResult {
  blob: Blob;
  filename: string;
  level: number;
  deadline: string;
}

// Hilfsfunktionen
function formatDate(date: Date): string {
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatMonth(month: string): string {
  const [y, m] = month.split("-");
  const names = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  return `${names[parseInt(m) - 1]} ${y}`;
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

// Stufen-Konfiguration
function getLevelConfig(level: 1 | 2 | 3) {
  switch (level) {
    case 1:
      return {
        title: "Zahlungserinnerung",
        salutation: "wir möchten Sie freundlich daran erinnern, dass für Ihre Wohnung noch Mietzahlungen ausstehen.",
        closing: "Wir bitten Sie, die ausstehenden Beträge bis zum unten genannten Datum zu überweisen. Sollte sich Ihre Zahlung mit diesem Schreiben überschnitten haben, betrachten Sie dieses bitte als gegenstandslos.",
        tone: "freundlich",
      };
    case 2:
      return {
        title: "1. Mahnung",
        salutation: "trotz unserer Zahlungserinnerung sind für Ihre Wohnung weiterhin Mietzahlungen offen. Wir fordern Sie hiermit auf, die ausstehenden Beträge umgehend zu begleichen.",
        closing: "Bitte überweisen Sie den ausstehenden Betrag bis zum unten genannten Datum. Sollte die Zahlung nicht fristgerecht eingehen, sehen wir uns gezwungen, weitere Maßnahmen einzuleiten.",
        tone: "bestimmt",
      };
    case 3:
      return {
        title: "2. Mahnung",
        salutation: "trotz unserer bisherigen Mahnungen sind für Ihre Wohnung erhebliche Mietzahlungen offen. Wir fordern Sie hiermit letztmalig zur Zahlung auf.",
        closing: "", // wird dynamisch generiert wegen Kündigungshinweis
        tone: "streng",
      };
  }
}

// === Haupt-Funktion: DOCX generieren ===
export async function generateDunningLetter(input: DunningInput): Promise<DunningResult> {
  const config = getLevelConfig(input.level);
  const today = new Date();
  const deadline = new Date(today);
  deadline.setDate(deadline.getDate() + input.deadlineDays);
  const deadlineStr = formatDate(deadline);
  const todayStr = formatDate(today);

  // Prüfe ob 2+ Monate Rückstand (für Kündigungshinweis bei Stufe 3)
  const twoOrMoreMonths = input.monthsOpen.length >= 2;

  // Tabellen-Borders
  const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const borders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
  const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };

  // Tabellenspalten: Monat | Soll | Ist | Differenz
  const colWidths = [2800, 2000, 2000, 2200];
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);

  // Tabellenkopf
  const headerRow = new TableRow({
    children: [
      { text: "Monat", width: colWidths[0] },
      { text: "Soll-Miete", width: colWidths[1] },
      { text: "Eingang", width: colWidths[2] },
      { text: "Rückstand", width: colWidths[3] },
    ].map(
      (col) =>
        new TableCell({
          borders,
          width: { size: col.width, type: WidthType.DXA },
          margins: cellMargins,
          shading: { fill: "E8E8E8", type: ShadingType.CLEAR },
          children: [
            new Paragraph({
              children: [new TextRun({ text: col.text, bold: true, size: 20, font: "Arial" })],
            }),
          ],
        })
    ),
  });

  // Tabellenzeilen pro offenen Monat
  const dataRows = input.monthsOpen.map(
    (m) =>
      new TableRow({
        children: [
          formatMonth(m.month),
          formatCurrency(m.soll),
          formatCurrency(m.ist),
          formatCurrency(m.diff),
        ].map(
          (text, i) =>
            new TableCell({
              borders,
              width: { size: colWidths[i], type: WidthType.DXA },
              margins: cellMargins,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text,
                      size: 20,
                      font: "Arial",
                      bold: i === 3, // Rückstand fett
                      color: i === 3 ? "CC0000" : "000000",
                    }),
                  ],
                }),
              ],
            })
        ),
      })
  );

  // Summenzeile
  const sumRow = new TableRow({
    children: [
      { text: "Gesamt", width: colWidths[0] },
      { text: "", width: colWidths[1] },
      { text: "", width: colWidths[2] },
      { text: formatCurrency(input.totalDebt), width: colWidths[3] },
    ].map(
      (col, i) =>
        new TableCell({
          borders,
          width: { size: col.width, type: WidthType.DXA },
          margins: cellMargins,
          shading: { fill: "FFF0F0", type: ShadingType.CLEAR },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: col.text,
                  bold: true,
                  size: 20,
                  font: "Arial",
                  color: i === 3 ? "CC0000" : "000000",
                }),
              ],
            }),
          ],
        })
    ),
  });

  // Dokument-Inhalt aufbauen
  const children: Paragraph[] = [];

  // Absender (klein, oben)
  children.push(
    new Paragraph({
      spacing: { after: 0 },
      children: [
        new TextRun({
          text: `${input.landlordName} · ${input.landlordAddress} · ${input.landlordCity}`,
          size: 16,
          font: "Arial",
          color: "666666",
        }),
      ],
    })
  );

  // Leerzeile
  children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

  // Empfänger
  children.push(
    new Paragraph({
      spacing: { after: 0 },
      children: [new TextRun({ text: input.tenantName, size: 22, font: "Arial" })],
    })
  );
  if (input.tenantAddress) {
    children.push(
      new Paragraph({
        spacing: { after: 0 },
        children: [new TextRun({ text: input.tenantAddress, size: 22, font: "Arial" })],
      })
    );
  }
  children.push(
    new Paragraph({
      spacing: { after: 0 },
      children: [
        new TextRun({ text: `${input.objectName}, ${input.unitLabel}`, size: 22, font: "Arial" }),
      ],
    })
  );

  // Leerzeilen
  children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
  children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

  // Datum rechtsbündig
  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 200 },
      children: [new TextRun({ text: todayStr, size: 22, font: "Arial" })],
    })
  );

  // Leerzeile
  children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

  // Betreff
  children.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `${config.title} – ${input.objectName}, ${input.unitLabel}`,
          bold: true,
          size: 24,
          font: "Arial",
        }),
      ],
    })
  );

  // Leerzeile
  children.push(new Paragraph({ spacing: { after: 100 }, children: [] }));

  // Anrede + Einleitungstext
  children.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `Sehr geehrte/r ${input.tenantName},`,
          size: 22,
          font: "Arial",
        }),
      ],
    })
  );

  children.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: config.salutation,
          size: 22,
          font: "Arial",
        }),
      ],
    })
  );

  // Einleitungssatz vor Tabelle
  children.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: "Folgende Zahlungen stehen aus:",
          size: 22,
          font: "Arial",
        }),
      ],
    })
  );

  // Leerzeile vor Tabelle
  children.push(new Paragraph({ spacing: { after: 100 }, children: [] }));

  // Platzhalter für Tabelle (wird als separates Element eingefügt)
  // Die Tabelle wird direkt in die Section eingefügt

  // Leerzeile nach Tabelle
  const afterTableParagraphs: Paragraph[] = [];

  afterTableParagraphs.push(new Paragraph({ spacing: { after: 100 }, children: [] }));

  // Zahlungsinformationen
  afterTableParagraphs.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `Bitte überweisen Sie den Gesamtbetrag von ${formatCurrency(input.totalDebt)} bis zum ${deadlineStr} auf folgendes Konto:`,
          size: 22,
          font: "Arial",
        }),
      ],
    })
  );

  afterTableParagraphs.push(new Paragraph({ spacing: { after: 100 }, children: [] }));

  // Bankverbindung
  afterTableParagraphs.push(
    new Paragraph({
      spacing: { after: 0 },
      children: [
        new TextRun({ text: "Kontoinhaber: ", size: 22, font: "Arial", bold: true }),
        new TextRun({ text: input.landlordName, size: 22, font: "Arial" }),
      ],
    })
  );
  afterTableParagraphs.push(
    new Paragraph({
      spacing: { after: 0 },
      children: [
        new TextRun({ text: "IBAN: ", size: 22, font: "Arial", bold: true }),
        new TextRun({ text: input.landlordIban, size: 22, font: "Arial" }),
      ],
    })
  );
  if (input.landlordBic) {
    afterTableParagraphs.push(
      new Paragraph({
        spacing: { after: 0 },
        children: [
          new TextRun({ text: "BIC: ", size: 22, font: "Arial", bold: true }),
          new TextRun({ text: input.landlordBic, size: 22, font: "Arial" }),
        ],
      })
    );
  }
  afterTableParagraphs.push(
    new Paragraph({
      spacing: { after: 0 },
      children: [
        new TextRun({ text: "Verwendungszweck: ", size: 22, font: "Arial", bold: true }),
        new TextRun({
          text: `Miete ${input.tenantName} – ${input.unitLabel}`,
          size: 22,
          font: "Arial",
        }),
      ],
    })
  );

  afterTableParagraphs.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

  // Abschlusssatz
  if (input.level === 3) {
    // Stufe 3: Kündigungshinweis wenn 2+ Monate
    afterTableParagraphs.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: "Sollte die Zahlung nicht bis zum genannten Datum bei uns eingehen, werden wir ohne weitere Ankündigung rechtliche Schritte einleiten.",
            size: 22,
            font: "Arial",
          }),
        ],
      })
    );

    if (twoOrMoreMonths) {
      afterTableParagraphs.push(
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: "Wir weisen Sie darauf hin, dass bei einem Mietrückstand von zwei oder mehr Monatsmieten gemäß § 543 Abs. 2 Nr. 3 BGB ein wichtiger Grund zur fristlosen Kündigung des Mietverhältnisses vorliegt. Wir behalten uns dieses Recht ausdrücklich vor.",
              size: 22,
              font: "Arial",
              bold: true,
            }),
          ],
        })
      );
    }
  } else {
    afterTableParagraphs.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: config.closing,
            size: 22,
            font: "Arial",
          }),
        ],
      })
    );
  }

  // Leerzeilen + Grußformel
  afterTableParagraphs.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
  afterTableParagraphs.push(
    new Paragraph({
      spacing: { after: 0 },
      children: [
        new TextRun({ text: "Mit freundlichen Grüßen", size: 22, font: "Arial" }),
      ],
    })
  );
  afterTableParagraphs.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
  afterTableParagraphs.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
  afterTableParagraphs.push(
    new Paragraph({
      spacing: { after: 0 },
      children: [new TextRun({ text: input.landlordName, size: 22, font: "Arial" })],
    })
  );

  // Kontaktdaten im Footer
  if (input.landlordPhone || input.landlordEmail) {
    afterTableParagraphs.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
    const contactParts: string[] = [];
    if (input.landlordPhone) contactParts.push(`Tel: ${input.landlordPhone}`);
    if (input.landlordEmail) contactParts.push(`E-Mail: ${input.landlordEmail}`);
    afterTableParagraphs.push(
      new Paragraph({
        spacing: { after: 0 },
        children: [
          new TextRun({ text: contactParts.join(" · "), size: 18, font: "Arial", color: "666666" }),
        ],
      })
    );
  }

  // Dokument zusammenbauen
  const rückstandTable = new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [headerRow, ...dataRows, sumRow],
  });

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 22 } } },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: [...children, rückstandTable, ...afterTableParagraphs],
      },
    ],
  });

  const buffer = await Packer.toBlob(doc);

  // Dateiname: Stufe_Mieter_Datum.docx
  const levelName = input.level === 1 ? "Erinnerung" : input.level === 2 ? "1-Mahnung" : "2-Mahnung";
  const safeName = input.tenantName.replace(/[^a-zA-ZäöüÄÖÜß\s]/g, "").replace(/\s+/g, "_");
  const dateStr = today.toISOString().split("T")[0];
  const filename = `${levelName}_${safeName}_${dateStr}.docx`;

  return {
    blob: buffer,
    filename,
    level: input.level,
    deadline: deadlineStr,
  };
}

// === Hilfsfunktion: nächste Mahnstufe für einen Mieter ermitteln ===
export function getNextDunningLevel(
  existingLogs: { level: number; created_at: string }[]
): 1 | 2 | 3 {
  if (existingLogs.length === 0) return 1;
  const maxLevel = Math.max(...existingLogs.map((l) => l.level));
  if (maxLevel >= 3) return 3; // Bleibt auf Stufe 3
  return (maxLevel + 1) as 1 | 2 | 3;
}

// === Hilfsfunktion: offene Monate für einen Mieter berechnen ===
export function calcOpenMonths(
  tenantId: string,
  rentTotal: number,
  transactions: { tenant_id: string | null; month_period: string; amount: number }[],
  months: string[]
): { month: string; soll: number; ist: number; diff: number }[] {
  return months
    .map((month) => {
      const txForMonth = transactions.filter(
        (t) => t.tenant_id === tenantId && t.month_period === month
      );
      const ist = txForMonth.reduce((s, t) => s + t.amount, 0);
      const diff = rentTotal - ist;
      return { month, soll: rentTotal, ist, diff };
    })
    .filter((m) => m.diff > 0); // Nur Monate mit Rückstand
}
