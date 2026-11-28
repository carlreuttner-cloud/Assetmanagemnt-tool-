/**
 * Testdaten Serienbriefe: eine Vorlage für Mieterhöhungsverlangen und ein allgemeines Schreiben.
 * Die Texte sind Beispiele und keine Rechtsberatung (Testdaten).
 */
import type { PrismaClient } from "../../src/generated/prisma/client";

export async function baueSerienbriefe(db: PrismaClient, mandantId: string) {
  await db.briefvorlage.createMany({
    data: [
      {
        mandantId,
        name: "Mieterhöhung Vergleichsmiete",
        art: "MIETERHOEHUNG",
        betreff: "Mieterhöhungsverlangen für {{einheit}}, {{anschrift}}",
        text: [
          "Sehr geehrte Damen und Herren,",
          "für Ihre Wohnung {{einheit}} ({{flaeche}} m²) zahlen Sie seit {{mietbeginn}} derzeit eine Nettokaltmiete von {{miete}} im Monat.",
          "Wir bitten Sie, einer Erhöhung der Nettokaltmiete um {{erhoehungProzent}} ({{erhoehungBetrag}} im Monat) auf {{neueMiete}} im Monat zuzustimmen, wirksam frühestens ab {{wirksamAb}}. Die neue Jahresnettokaltmiete beträgt {{neueJahresmiete}}.",
          "[Begründung, z. B. Mietspiegel – TESTDATEN]",
          "Mit freundlichen Grüßen\n{{gesellschaft}}",
        ].join("\n\n"),
        erstelltVon: "Testdaten",
      },
      {
        mandantId,
        name: "Ankündigung Treppenhausreinigung",
        art: "ALLGEMEIN",
        betreff: "Information zu Ihrem Haus {{haus}}",
        text: "Sehr geehrte Damen und Herren,\n\nab dem kommenden Monat übernimmt ein neuer Dienstleister die Reinigung des Treppenhauses im Haus {{haus}}.\n\nMit freundlichen Grüßen\n{{gesellschaft}}",
        erstelltVon: "Testdaten",
      },
    ],
  });
}
