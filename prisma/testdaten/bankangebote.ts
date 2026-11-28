/**
 * Testangebote (TESTDATEN) zur Refinanzierung von K01: zwei Festzins-Angebote und ein variables,
 * bereits bestätigt, damit der Vergleich sofort etwas zeigt. Das Term Sheet der Testbank Nord
 * liegt zusätzlich in der Dateiablage und kann unter „Angebot erfassen“ ausgelesen werden.
 */
import type { PrismaClient } from "../../src/generated/prisma/client";

export async function baueBankangebote(db: PrismaClient, mandantId: string, benutzerId: string) {
  const k01 = await db.kredit.findFirst({ where: { mandantId, bezeichnung: { contains: "(K01)" } }, select: { id: true, gesellschaftId: true } });
  if (!k01) return;
  const gemeinsam = { mandantId, gesellschaftId: k01.gesellschaftId, kreditId: k01.id, status: "BESTAETIGT" as const, erstelltVonId: benutzerId, bestaetigtVonId: benutzerId, bestaetigtAm: new Date("2026-11-20T10:00:00Z") };
  await db.bankangebot.createMany({
    data: [
      {
        ...gemeinsam,
        bank: "Testbank Nord AG",
        bezeichnung: "Festzins 10 Jahre",
        angebotVom: new Date("2026-11-15"),
        gueltigBis: new Date("2026-12-15"),
        betrag: "2400000",
        zinsArt: "FEST",
        sollzins: "3.65",
        zinsbindungMonate: 120,
        tilgungProzent: "2",
        auszahlungProzent: "100",
        bearbeitungsgebuehr: "9600",
        bereitstellungszins: "0.25",
        bereitstellungsfreiMonate: 6,
        sondertilgungProzent: "5",
        covenants: "LTV höchstens 65 %\nDSCR mindestens 1,20",
        sicherheiten: "Erstrangige Grundschuld 2.400.000 EUR",
      },
      {
        ...gemeinsam,
        bank: "Beispiel Hypothekenbank AG",
        bezeichnung: "Festzins 10 Jahre mit Disagio",
        angebotVom: new Date("2026-11-18"),
        gueltigBis: new Date("2026-12-31"),
        betrag: "2400000",
        zinsArt: "FEST",
        sollzins: "3.45",
        zinsbindungMonate: 120,
        tilgungProzent: "2",
        auszahlungProzent: "98.5",
        bearbeitungsgebuehr: "0",
        sondertilgungProzent: "0",
        covenants: "LTV höchstens 60 %",
        sicherheiten: "Erstrangige Grundschuld 2.400.000 EUR, Abtretung der Mieten",
      },
      {
        ...gemeinsam,
        bank: "Demo Landesbank",
        bezeichnung: "Variabel 3M-EURIBOR",
        angebotVom: new Date("2026-11-19"),
        betrag: "2400000",
        zinsArt: "VARIABEL",
        referenzzins: "3M-EURIBOR",
        marge: "1.55",
        laufzeitMonate: 120,
        tilgungProzent: "2",
        auszahlungProzent: "100",
        bearbeitungsgebuehr: "5000",
        sondertilgungProzent: "10",
        covenants: "DSCR mindestens 1,25\nICR mindestens 2,0",
        sicherheiten: "Erstrangige Grundschuld 2.400.000 EUR",
      },
    ],
  });
  console.log("Bankangebote: 3 bestätigte Testangebote zu K01.");
}
