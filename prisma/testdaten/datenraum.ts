/**
 * Weitere Testdokumente für den Datenraum der Lindenhof-Gesellschaft: Gesellschaftsvertrag, ein
 * Kreditvertrag, ein Gutachten zu einem Haus und ein Mietvertrag zu einer Einheit. Kleine PDFs, die
 * deutlich als TESTDOKUMENT gekennzeichnet sind.
 */
import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { speichere } from "../../src/lib/dateispeicher";

async function pdf(zeilen: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const seite = doc.addPage([595, 842]);
  const schrift = await doc.embedFont(StandardFonts.Helvetica);
  ["TESTDOKUMENT - keine echten Daten", "", ...zeilen].forEach((z, i) => seite.drawText(z, { x: 60, y: 780 - i * 22, size: i === 0 ? 16 : 12, font: schrift }));
  return doc.save();
}

export async function baueDatenraumDokumente(db: PrismaClient, mandantId: string, benutzerId: string) {
  const g = await db.gesellschaft.findFirst({
    where: { mandantId, name: { startsWith: "Lindenhof" } },
    select: {
      id: true,
      name: true,
      kredite: { orderBy: { bezeichnung: "asc" }, take: 1, select: { id: true, bezeichnung: true } },
      haeuser: {
        orderBy: { bezeichnung: "asc" },
        take: 1,
        select: { id: true, bezeichnung: true, einheiten: { where: { mietverhaeltnisse: { some: {} } }, take: 1, select: { id: true, bezeichnung: true, mietverhaeltnisse: { take: 1, select: { id: true } } } } },
      },
    },
  });
  if (!g) return;
  const haus = g.haeuser[0];
  const einheit = haus?.einheiten[0];
  const dokumente = [
    { titel: `Gesellschaftsvertrag – ${g.name}`, kategorie: "Gesellschaftsvertrag", datum: "2015-06-01", ziel: { gesellschaftId: g.id } },
    ...(g.kredite[0] ? [{ titel: `Kreditvertrag – ${g.kredite[0].bezeichnung}`, kategorie: "Kreditvertrag", datum: "2019-04-15", ziel: { gesellschaftId: g.id, kreditId: g.kredite[0].id } }] : []),
    ...(haus ? [{ titel: `Verkehrswertgutachten – ${haus.bezeichnung}`, kategorie: "Gutachten", datum: "2025-09-30", ziel: { hausId: haus.id } }] : []),
    ...(haus && einheit
      ? [{ titel: `Mietvertrag – ${einheit.bezeichnung}`, kategorie: "Mietvertrag", datum: "2021-02-01", ziel: { hausId: haus.id, einheitId: einheit.id, mietverhaeltnisId: einheit.mietverhaeltnisse[0]?.id ?? null } }]
      : []),
  ];
  for (const d of dokumente) {
    const daten = await pdf([d.titel, `Datum: ${d.datum}`]);
    const speicherPfad = await speichere(mandantId, "dokumente", "pdf", daten);
    await db.dokument.create({
      data: {
        mandantId,
        titel: d.titel,
        kategorie: d.kategorie,
        dokumentDatum: new Date(`${d.datum}T00:00:00Z`),
        speicherPfad,
        dateiname: `${d.kategorie}.pdf`,
        mimeType: "application/pdf",
        groesseBytes: daten.length,
        pruefsumme: createHash("sha256").update(daten).digest("hex"),
        bestaetigt: true,
        textQuelle: "KEINE",
        hochgeladenVonId: benutzerId,
        ...d.ziel,
      },
    });
  }
}
