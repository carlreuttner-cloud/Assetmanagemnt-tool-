/**
 * Testdokumente (prisma/testdaten/dateien/*.pdf, alle als TESTDOKUMENT gekennzeichnet) für die
 * Dateiablage: zwei bestätigte PDFs mit Textebene und ein eingescanntes PDF ohne Textebene,
 * dessen Vorschlag noch bestätigt werden muss. Texterkennung läuft wie beim Hochladen; fehlen
 * poppler-utils oder tesseract, werden die Dokumente ohne Text angelegt (Hinweis in der Ansicht).
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { pfadAufDisk, speichere } from "../../src/lib/dateispeicher";
import { erkenneText } from "../../src/lib/dokument-text";
import { einheitlicherName, erkenneAbsender, erkenneDatum, erkenneJahr, erkenneKategorie, erkenneObjekt, jahrbezogen, ueblicheZuordnung, type ObjektKandidat } from "../../src/lib/dokument-vorschlag";

const DOKUMENTE = [
  { datei: "JA2025_Lindenhof_final.pdf", bestaetigt: true },
  { datei: "Grundbuch_Abruf.pdf", bestaetigt: true },
  { datei: "Scan_0001.pdf", bestaetigt: false },
  { datei: "TermSheet_Testbank_Nord.pdf", bestaetigt: true },
];

export async function legeTestdokumenteAn(db: PrismaClient, mandantId: string, benutzerId: string) {
  const [gesellschaften, haeuser] = await Promise.all([
    db.gesellschaft.findMany({ where: { mandantId }, select: { id: true, name: true, registernummer: true } }),
    db.haus.findMany({ where: { mandantId }, select: { id: true, bezeichnung: true, strasse: true } }),
  ]);
  const kandidaten: ObjektKandidat[] = [
    ...gesellschaften.map((g) => ({ art: "gesellschaft" as const, id: g.id, name: g.name, begriffe: [g.registernummer?.replace(/\s*\(.*\)$/, "") ?? ""] })),
    ...haeuser.map((h) => ({ art: "haus" as const, id: h.id, name: h.bezeichnung, begriffe: [h.strasse ?? ""] })),
  ];
  const banken = await db.kredit.findMany({ where: { mandantId, bank: { not: null } }, distinct: ["bank"], select: { bank: true } });
  let mitText = 0;
  for (const d of DOKUMENTE) {
    const daten = new Uint8Array(await readFile(join(__dirname, "dateien", d.datei)));
    const speicherPfad = await speichere(mandantId, "dokumente", "pdf", daten);
    const text = await erkenneText(pfadAufDisk(speicherPfad), "application/pdf");
    if (text.seiten.length > 0) mitText++;
    const volltext = text.seiten.join("\n");
    const kategorie = erkenneKategorie(volltext, d.datei)?.kategorie ?? null;
    const jahr = jahrbezogen(kategorie) ? erkenneJahr(volltext, d.datei) : null;
    const datum = jahr ? null : erkenneDatum(volltext);
    const objekt = erkenneObjekt(volltext, kandidaten, ueblicheZuordnung(kategorie))?.objekt ?? null;
    const absender = erkenneAbsender(volltext, kategorie, banken.map((b) => b.bank!));
    await db.dokument.create({
      data: {
        mandantId,
        titel: einheitlicherName({ kategorie, jahr, datum, objekt: objekt?.name ?? null }, "Dokument"),
        kategorie,
        jahr,
        dokumentDatum: datum ? new Date(`${datum}T00:00:00Z`) : null,
        speicherPfad,
        dateiname: d.datei,
        mimeType: "application/pdf",
        groesseBytes: daten.length,
        pruefsumme: createHash("sha256").update(daten).digest("hex"),
        absenderArt: absender?.art ?? null,
        absenderName: absender?.name ?? null,
        bestaetigt: d.bestaetigt,
        textQuelle: text.quelle,
        textHinweis: text.hinweis,
        seitenAnzahl: text.seitenAnzahl,
        hochgeladenVonId: benutzerId,
        gesellschaftId: objekt?.art === "gesellschaft" ? objekt.id : null,
        hausId: objekt?.art === "haus" ? objekt.id : null,
        seiten: { create: text.seiten.map((t, i) => ({ mandantId, nummer: i + 1, text: t })) },
      },
    });
  }
  console.log(`Testdokumente: ${DOKUMENTE.length} (davon ${mitText} mit erkanntem Text).`);
}
