/**
 * Testdaten für die lokale Entwicklung. Löscht ALLE Daten und legt sie neu an.
 * Start: `npm run db:seed`
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "../src/generated/prisma/client";

if (process.env.NODE_ENV === "production") {
  throw new Error("Der Seed löscht alle Daten und darf nicht in Produktion laufen.");
}

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DEMO_PASSWORT = process.env.SEED_PASSWORT ?? "";
if (!DEMO_PASSWORT || DEMO_PASSWORT === "bitte-ersetzen") {
  throw new Error("Bitte SEED_PASSWORT in der .env setzen (Passwort für die Demo-Benutzer).");
}

async function main() {
  // Mandanten-Löschung kaskadiert auf alle fachlichen Daten.
  await db.mandant.deleteMany();
  await db.benutzer.deleteMany();

  const passwortHash = await hash(DEMO_PASSWORT);
  const benutzer = async (email: string, name: string) =>
    db.benutzer.create({ data: { email, name, passwortHash } });

  const admin = await benutzer("admin@demo.local", "Anna Admin");
  const mitarbeiter = await benutzer("mitarbeiter@demo.local", "Max Mitarbeiter");
  const verwaltung = await benutzer("hausverwaltung@demo.local", "Hausverwaltung Schmidt");
  const investor = await benutzer("investor@demo.local", "Ines Investor");

  // --- Mandant 1: Demo Immobilien ---------------------------------------------------
  const m1 = await db.mandant.create({ data: { name: "Demo Immobilien GmbH", slug: "demo" } });
  const mandantId = m1.id;

  const [mAdmin, , mVerwaltung, mInvestor] = await Promise.all([
    db.mitgliedschaft.create({ data: { mandantId, benutzerId: admin.id, rolle: "ADMIN" } }),
    db.mitgliedschaft.create({ data: { mandantId, benutzerId: mitarbeiter.id, rolle: "MITARBEITER" } }),
    db.mitgliedschaft.create({ data: { mandantId, benutzerId: verwaltung.id, rolle: "HAUSVERWALTUNG" } }),
    db.mitgliedschaft.create({ data: { mandantId, benutzerId: investor.id, rolle: "INVESTOR" } }),
  ]);
  void mAdmin;

  const gesellschaft = await db.gesellschaft.create({
    data: { mandantId, name: "Demo Wohnen GmbH & Co. KG", rechtsform: "GmbH & Co. KG" },
  });
  const gesellschaft2 = await db.gesellschaft.create({
    data: { mandantId, name: "Demo Gewerbe GmbH", rechtsform: "GmbH" },
  });

  const haus = await db.haus.create({
    data: {
      mandantId,
      gesellschaftId: gesellschaft.id,
      bezeichnung: "Lindenstraße 12",
      strasse: "Lindenstraße 12",
      plz: "10969",
      ort: "Berlin",
      kaufpreis: "1850000.00",
      kaufdatum: new Date("2019-04-01"),
    },
  });
  const haus2 = await db.haus.create({
    data: {
      mandantId,
      gesellschaftId: gesellschaft2.id,
      bezeichnung: "Hafenweg 3",
      strasse: "Hafenweg 3",
      plz: "20457",
      ort: "Hamburg",
      kaufpreis: "2400000.00",
      kaufdatum: new Date("2021-09-15"),
    },
  });

  await db.verkehrswert.createMany({
    data: [
      { mandantId, hausId: haus.id, wert: "2100000.00", stichtag: new Date("2023-12-31"), quelle: "Gutachten" },
      { mandantId, hausId: haus.id, wert: "2050000.00", stichtag: new Date("2025-12-31"), quelle: "Bankbewertung" },
      { mandantId, hausId: haus2.id, wert: "2350000.00", stichtag: new Date("2025-12-31"), quelle: "Gutachten" },
    ],
  });

  const whg1 = await db.einheit.create({
    data: { mandantId, hausId: haus.id, bezeichnung: "WE 01", art: "WOHNUNG", flaeche: "72.50", lage: "EG links" },
  });
  const whg2 = await db.einheit.create({
    data: { mandantId, hausId: haus.id, bezeichnung: "WE 02", art: "WOHNUNG", flaeche: "68.20", lage: "EG rechts" },
  });
  const laden = await db.einheit.create({
    data: { mandantId, hausId: haus2.id, bezeichnung: "GE 01", art: "GEWERBE", flaeche: "145.00", lage: "EG" },
  });

  const mieterA = await db.mieter.create({ data: { mandantId, name: "Familie Weber" } });
  const mieterB = await db.mieter.create({ data: { mandantId, name: "Jonas Becker" } });
  const mieterC = await db.mieter.create({ data: { mandantId, name: "Café Hafenblick GmbH", istFirma: true } });

  await db.mietverhaeltnis.createMany({
    data: [
      {
        mandantId, einheitId: whg1.id, mieterId: mieterA.id, beginn: new Date("2019-06-01"),
        istMiete: "812.00", sollMiete: "812.00", letzteMieterhoehung: new Date("2024-06-01"),
      },
      {
        mandantId, einheitId: whg2.id, mieterId: mieterB.id, beginn: new Date("2022-02-01"),
        istMiete: "690.00", sollMiete: "745.00", rueckstand: "1380.00", rueckstandStichtag: new Date("2026-10-31"),
      },
      {
        mandantId, einheitId: laden.id, mieterId: mieterC.id, beginn: new Date("2021-10-01"),
        istMiete: "2900.00", sollMiete: "2900.00",
      },
    ],
  });

  const kredit = await db.kredit.create({
    data: {
      mandantId,
      gesellschaftId: gesellschaft.id,
      bezeichnung: "Annuitätendarlehen Lindenstraße",
      bank: "Musterbank AG",
      iban: "DE02120300000000202051",
      ursprungsbetrag: "1400000.00",
      auszahlungsdatum: new Date("2019-04-01"),
      zinsArt: "FEST",
      sollzins: "1.450000",
      zinsbindungBis: new Date("2029-03-31"),
    },
  });
  const kredit2 = await db.kredit.create({
    data: {
      mandantId,
      gesellschaftId: gesellschaft2.id,
      bezeichnung: "Variables Darlehen Hafenweg",
      bank: "Hansebank eG",
      iban: "DE89370400440532013000",
      ursprungsbetrag: "1800000.00",
      auszahlungsdatum: new Date("2021-09-15"),
      zinsArt: "VARIABEL",
      referenzzins: "3M-EURIBOR",
      marge: "1.600000",
    },
  });

  await db.kreditHaus.createMany({
    data: [
      { mandantId, kreditId: kredit.id, hausId: haus.id, anteilProzent: "100.000000" },
      { mandantId, kreditId: kredit2.id, hausId: haus2.id, anteilProzent: "100.000000" },
    ],
  });
  await db.covenant.create({
    data: {
      mandantId, kreditId: kredit2.id, kennzahl: "LTV", vergleich: "HOECHSTENS",
      schwellenwert: "75.000000", pruefrhythmus: "jährlich zum 31.12.",
    },
  });
  await db.kreditbuchung.createMany({
    data: [
      { mandantId, kreditId: kredit.id, datum: new Date("2026-09-30"), art: "ZINS", betrag: "1452.10", saldoNach: "1201723.45" },
      { mandantId, kreditId: kredit.id, datum: new Date("2026-09-30"), art: "TILGUNG", betrag: "2214.57", saldoNach: "1199508.88" },
    ],
  });
  const plan = await db.tilgungsplan.create({
    data: { mandantId, kreditId: kredit.id, version: 1, gueltigAb: new Date("2019-04-01"), bezeichnung: "Ursprungsplan" },
  });
  await db.tilgungsplanZeile.createMany({
    data: [
      { mandantId, tilgungsplanId: plan.id, faelligAm: new Date("2026-10-31"), zins: "1449.41", tilgung: "2217.26", rate: "3666.67", restschuld: "1197291.62" },
      { mandantId, tilgungsplanId: plan.id, faelligAm: new Date("2026-11-30"), zins: "1446.73", tilgung: "2219.94", rate: "3666.67", restschuld: "1195071.68" },
    ],
  });
  await db.investition.create({
    data: { mandantId, hausId: haus.id, datum: new Date("2024-08-20"), betrag: "48500.00", kategorie: "Heizung", beschreibung: "Austausch Gasheizung gegen Wärmepumpe" },
  });

  // Zuweisungen für eingeschränkte Rollen
  await db.hausZuweisung.create({ data: { mandantId, mitgliedschaftId: mVerwaltung.id, hausId: haus.id } });
  await db.gesellschaftZuweisung.create({ data: { mandantId, mitgliedschaftId: mInvestor.id, gesellschaftId: gesellschaft.id } });

  // --- Mandant 2: zeigt Mandantentrennung und Mandantenwechsel ----------------------
  const m2 = await db.mandant.create({ data: { name: "Zweite Kunde AG", slug: "zweite-kunde" } });
  await db.mitgliedschaft.create({ data: { mandantId: m2.id, benutzerId: admin.id, rolle: "ADMIN" } });
  await db.gesellschaft.create({ data: { mandantId: m2.id, name: "Nur für Mandant 2 sichtbar GmbH" } });

  console.log("Testdaten angelegt. Passwort für alle Demo-Benutzer: SEED_PASSWORT aus der .env");
}

main()
  .catch((fehler) => {
    console.error(fehler);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
