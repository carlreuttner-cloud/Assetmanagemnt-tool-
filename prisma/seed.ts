/**
 * Testdaten für die lokale Entwicklung. Löscht ALLE Daten und legt sie neu an.
 * Start: `npm run db:seed`
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "@node-rs/argon2";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { BANKEN, erzeugePortfolio, PORTFOLIOS, type TestPortfolio } from "./testdaten/portfolio";
import { baueFinanzen } from "./testdaten/finanzen";
import { baueWaterfall } from "./testdaten/waterfall";
import { baueNachweise, TEST_VORGABEN } from "./testdaten/dokumente";
import { euribor, monatsanfang, monatsNummer } from "./testdaten/hilfen";
import { legeTestdokumenteAn } from "./testdaten/dateien";

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

  // --- Mandant 1: Demo Immobilien mit dem Testportfolio (prisma/testdaten/) ---------
  const m1 = await db.mandant.create({ data: { name: "Demo Immobilien GmbH", slug: "demo" } });
  const mandantId = m1.id;

  const [, , mVerwaltung, mInvestor] = await Promise.all([
    db.mitgliedschaft.create({ data: { mandantId, benutzerId: admin.id, rolle: "ADMIN" } }),
    db.mitgliedschaft.create({ data: { mandantId, benutzerId: mitarbeiter.id, rolle: "MITARBEITER" } }),
    db.mitgliedschaft.create({ data: { mandantId, benutzerId: verwaltung.id, rolle: "HAUSVERWALTUNG" } }),
    db.mitgliedschaft.create({ data: { mandantId, benutzerId: investor.id, rolle: "INVESTOR" } }),
  ]);

  const ids = await legePortfolioAn(mandantId, erzeugePortfolio());

  // Zuweisungen für eingeschränkte Rollen
  await db.hausZuweisung.createMany({
    data: ["H01", "H04"].map((h) => ({ mandantId, mitgliedschaftId: mVerwaltung.id, hausId: ids.haus.get(h)! })),
  });
  await db.gesellschaftZuweisung.create({
    data: { mandantId, mitgliedschaftId: mInvestor.id, gesellschaftId: ids.gesellschaft.get("G1")! },
  });

  await legeTestdokumenteAn(db, mandantId, admin.id);

  // --- Mandant 2: zeigt Mandantentrennung und Mandantenwechsel ----------------------
  const m2 = await db.mandant.create({ data: { name: "Zweite Kunde AG", slug: "zweite-kunde" } });
  await db.mitgliedschaft.create({ data: { mandantId: m2.id, benutzerId: admin.id, rolle: "ADMIN" } });
  await db.gesellschaft.create({ data: { mandantId: m2.id, name: "Nur für Mandant 2 sichtbar GmbH" } });

  console.log("Testdaten angelegt. Passwort für alle Demo-Benutzer: SEED_PASSWORT aus der .env");
}

const tag = (datum: string) => new Date(`${datum}T00:00:00Z`);
const geld = (wert: { toFixed(stellen: number): string }) => wert.toFixed(2);
const prozent = (wert: { toFixed(stellen: number): string }) => wert.toFixed(6);

/** Schreibt den erzeugten Testdatensatz in die Datenbank (mit Massen-Inserts, eigene IDs). */
async function legePortfolioAn(mandantId: string, p: TestPortfolio) {
  const gesellschaft = new Map(p.gesellschaften.map((g) => [g.schluessel, randomUUID()]));
  const haus = new Map(p.haeuser.map((h) => [h.schluessel, randomUUID()]));
  const kredit = new Map(p.kredite.map((k) => [k.schluessel, randomUUID()]));

  const portfolio = new Map(PORTFOLIOS.map((x) => [x.schluessel as string, randomUUID()]));
  await db.portfolio.createMany({
    data: PORTFOLIOS.map((x) => ({ id: portfolio.get(x.schluessel)!, mandantId, name: x.name, beschreibung: x.beschreibung })),
  });
  await db.gesellschaft.createMany({
    data: p.gesellschaften.map((g) => ({
      id: gesellschaft.get(g.schluessel)!, mandantId, name: g.name, rechtsform: g.rechtsform,
      registernummer: g.registernummer, steuernummer: g.steuernummer,
      portfolioId: g.portfolio ? portfolio.get(g.portfolio)! : null,
    })),
  });
  await db.haus.createMany({
    data: p.haeuser.map((h) => ({
      id: haus.get(h.schluessel)!, mandantId, gesellschaftId: gesellschaft.get(h.gesellschaft)!,
      bezeichnung: h.bezeichnung, strasse: h.strasse, plz: h.plz, ort: h.ort,
      kaufpreis: geld(h.kaufpreis), kaufdatum: tag(h.kaufdatum),
    })),
  });
  const verkehrswertIds = new Map<string, string>();
  await db.verkehrswert.createMany({
    data: p.haeuser.flatMap((h) => h.verkehrswerte.map((v) => {
      const id = randomUUID();
      if (v.quelle === "Gutachten") verkehrswertIds.set(`${h.schluessel}|${v.stichtag}`, id);
      return { id, mandantId, hausId: haus.get(h.schluessel)!, wert: geld(v.wert), stichtag: tag(v.stichtag), quelle: v.quelle };
    })),
  });
  const optGeld = (w: { toFixed(stellen: number): string } | null) => (w === null ? null : geld(w));
  await db.gutachten.createMany({
    data: p.haeuser.flatMap((h) => h.gutachten.map((g) => ({
      mandantId, hausId: haus.get(h.schluessel)!, verkehrswertId: verkehrswertIds.get(`${h.schluessel}|${g.stichtag}`) ?? null,
      stichtag: tag(g.stichtag), erstelltAm: tag(g.erstelltAm), gutachter: g.gutachter, anlass: g.anlass, verfahren: g.verfahren,
      verkehrswert: geld(g.verkehrswert), rohertragJahr: optGeld(g.rohertragJahr), bewirtschaftungskosten: optGeld(g.bewirtschaftungskosten),
      reinertragJahr: optGeld(g.reinertragJahr), liegenschaftszins: g.liegenschaftszins?.toFixed(6) ?? null,
      restnutzungsdauer: g.restnutzungsdauer, gesamtnutzungsdauer: g.gesamtnutzungsdauer, barwertfaktor: g.barwertfaktor?.toFixed(6) ?? null,
      bodenwert: optGeld(g.bodenwert), gebaeudewert: optGeld(g.gebaeudewert), ertragswert: optGeld(g.ertragswert), zuAbschlaege: optGeld(g.zuAbschlaege),
      baujahr: g.baujahr, wohnflaeche: g.wohnflaeche?.toFixed(2) ?? null, gewerbeflaeche: g.gewerbeflaeche?.toFixed(2) ?? null,
      grundstuecksflaeche: g.grundstuecksflaeche?.toFixed(2) ?? null, einheiten: g.einheiten, zustand: g.zustand, energieklasse: g.energieklasse,
      lage: g.lage, staerken: g.staerken, schwaechen: g.schwaechen, chancen: g.chancen, risiken: g.risiken,
    }))),
  });

  const einheiten = [], mieter = [], mietverhaeltnisse = [], investitionen = [];
  for (const h of p.haeuser) {
    const einheitIds = new Map<string, string>();
    for (const e of h.einheiten) {
      const einheitId = randomUUID();
      einheitIds.set(e.bezeichnung, einheitId);
      einheiten.push({
        id: einheitId, mandantId, hausId: haus.get(h.schluessel)!, bezeichnung: e.bezeichnung, art: e.art,
        flaeche: e.flaeche.toFixed(2), lage: e.lage, erwarteteMiete: e.erwarteteMiete ? geld(e.erwarteteMiete) : null, notiz: e.notiz,
      });
      for (const m of e.mietverhaeltnisse) {
        const mieterId = randomUUID();
        mieter.push({ id: mieterId, mandantId, name: m.mieter.name, istFirma: m.mieter.istFirma });
        mietverhaeltnisse.push({
          mandantId, einheitId, mieterId, beginn: tag(m.beginn), ende: m.ende ? tag(m.ende) : null,
          istMiete: geld(m.istMiete), sollMiete: geld(m.sollMiete),
          letzteMieterhoehung: m.letzteMieterhoehung ? tag(m.letzteMieterhoehung) : null,
          rueckstand: geld(m.rueckstand), rueckstandStichtag: m.rueckstandStichtag ? tag(m.rueckstandStichtag) : null,
          notiz: m.notiz,
        });
      }
    }
    for (const i of h.investitionen) {
      investitionen.push({
        mandantId, hausId: haus.get(h.schluessel)!, einheitId: i.einheit ? einheitIds.get(i.einheit)! : null,
        datum: tag(i.datum), betrag: geld(i.betrag), kategorie: i.kategorie, beschreibung: i.beschreibung,
      });
    }
  }
  await db.einheit.createMany({ data: einheiten });
  await db.mieter.createMany({ data: mieter });
  await db.mietverhaeltnis.createMany({ data: mietverhaeltnisse });
  await db.investition.createMany({ data: investitionen });

  await db.kredit.createMany({
    data: p.kredite.map((k) => ({
      id: kredit.get(k.schluessel)!, mandantId, gesellschaftId: gesellschaft.get(k.gesellschaft)!,
      bezeichnung: `${k.bezeichnung} (${k.schluessel})`, bank: BANKEN[k.bank].name, kreditnummer: k.kreditnummer, iban: k.iban,
      ursprungsbetrag: geld(k.ursprungsbetrag), auszahlungsdatum: tag(k.auszahlungsdatum), zinsArt: k.zinsArt,
      sollzins: k.sollzins ? prozent(k.sollzins) : null, referenzzins: k.referenzzins,
      marge: k.marge ? prozent(k.marge) : null,
      zinsbindungBis: k.zinsbindungBis ? tag(k.zinsbindungBis) : null, laufzeitBis: k.laufzeitBis ? tag(k.laufzeitBis) : null,
      zahlweise: k.zahlweise, tilgungsart: k.tilgungsart, anfaenglicheTilgung: prozent(k.anfaenglicheTilgung),
      ratenbetrag: geld(k.ratenbetrag), notiz: k.notiz,
    })),
  });
  await db.kreditHaus.createMany({
    data: p.kredite.flatMap((k) => k.haeuser.map((x) => ({
      mandantId, kreditId: kredit.get(k.schluessel)!, hausId: haus.get(x.haus)!, anteilProzent: prozent(x.anteilProzent),
    }))),
  });
  await db.covenant.createMany({
    data: p.kredite.flatMap((k) => k.covenants.map((c) => ({
      mandantId, kreditId: kredit.get(k.schluessel)!, kennzahl: c.kennzahl, vergleich: c.vergleich,
      schwellenwert: c.schwellenwert, pruefrhythmus: c.pruefrhythmus, folge: c.folge ?? "COVENANT", beschreibung: c.beschreibung ?? null,
    }))),
  });
  await db.kreditbuchung.createMany({
    data: p.kredite.flatMap((k) => k.buchungen.map((b) => ({
      mandantId, kreditId: kredit.get(k.schluessel)!, datum: tag(b.datum), art: b.art,
      betrag: geld(b.betrag), saldoNach: geld(b.saldoNach),
    }))),
  });

  await db.kreditsaldo.createMany({
    data: p.kredite.flatMap((k) => k.salden.map((x) => ({
      mandantId, kreditId: kredit.get(k.schluessel)!, stichtag: x.stichtag ? tag(x.stichtag) : null,
      stichtagHinweis: x.stichtagHinweis, art: x.art, betrag: geld(x.betrag), quelle: x.quelle, quelleText: x.quelleText, status: x.status,
    }))),
  });

  await db.geschaeftsjahr.createMany({
    data: baueFinanzen(p.gesellschaften, p.haeuser, p.kredite).map((j) => ({
      mandantId, gesellschaftId: gesellschaft.get(j.gesellschaft)!, jahr: j.jahr, beginn: tag(`${j.jahr}-01-01`), ende: tag(`${j.jahr}-12-31`),
      quelle: j.quelle, quelleText: j.quelleText, status: j.status,
      ...Object.fromEntries(Object.entries(j.werte).map(([k, w]) => [k, w === null ? null : geld(w)])),
    })),
  });

  const vorgabe = new Map(TEST_VORGABEN.map((v) => [v.schluessel, randomUUID()]));
  await db.dokumentvorgabe.createMany({
    data: TEST_VORGABEN.map((v) => ({
      id: vorgabe.get(v.schluessel)!, mandantId, name: v.name, beschreibung: v.beschreibung, bezug: v.bezug,
      gueltigMonate: v.gueltigMonate, automatik: v.automatik, reihenfolge: v.reihenfolge,
    })),
  });
  const nachweise = baueNachweise([
    ...p.gesellschaften.map((g) => ({ bezug: "GESELLSCHAFT" as const, schluessel: g.schluessel })),
    ...p.haeuser.map((h) => ({ bezug: "HAUS" as const, schluessel: h.schluessel, ort: h.ort })),
    ...p.kredite.map((k) => ({ bezug: "KREDIT" as const, schluessel: k.schluessel })),
  ]);
  await db.dokumentnachweis.createMany({
    data: nachweise.map((n) => ({
      mandantId, vorgabeId: vorgabe.get(n.vorgabe)!,
      gesellschaftId: n.bezug === "GESELLSCHAFT" ? gesellschaft.get(n.objekt)! : null,
      hausId: n.bezug === "HAUS" ? haus.get(n.objekt)! : null,
      kreditId: n.bezug === "KREDIT" ? kredit.get(n.objekt)! : null,
      vorhanden: n.vorhanden, nichtErforderlich: n.nichtErforderlich, dokumentDatum: n.dokumentDatum ? tag(n.dokumentDatum) : null,
      ablageort: n.ablageort, notiz: n.notiz,
    })),
  });

  const waterfall = baueWaterfall(p.haeuser);
  for (const gs of waterfall.gesellschafter) {
    const gesellschafterId = randomUUID();
    await db.gesellschafter.create({
      data: {
        id: gesellschafterId, mandantId, gesellschaftId: gesellschaft.get(gs.gesellschaft)!, name: gs.name,
        beteiligungProzent: gs.beteiligungProzent?.toFixed(6) ?? null, gewinnanteilProzent: gs.gewinnanteilProzent?.toFixed(6) ?? null,
      },
    });
    await db.kapitalbewegung.createMany({
      data: gs.bewegungen.map((b) => ({ mandantId, gesellschafterId, art: b.art, datum: b.datum ? tag(b.datum) : null, betrag: geld(b.betrag), quelle: b.quelle })),
    });
  }
  await db.waterfallvertrag.createMany({
    data: waterfall.vertraege.map((v) => ({
      mandantId, gesellschaftId: gesellschaft.get(v.gesellschaft)!, vorzugsrenditeProzent: v.vorzugsrenditeProzent.toFixed(6),
      verzinsung: v.verzinsung, ausschuettungenAnrechnen: v.ausschuettungenAnrechnen, quelle: v.quelle,
    })),
  });

  // Referenzzinsen (Näherungswerte aus dem Generator), monatlich ab 01/2024.
  const referenzzinsen = [];
  for (let monat = monatsNummer("2024-01-01"); monat <= monatsNummer("2026-11-01"); monat++) {
    for (const referenz of ["3M-EURIBOR", "6M-EURIBOR"] as const) {
      referenzzinsen.push({
        mandantId, referenz, stichtag: tag(monatsanfang(monat)), satz: prozent(euribor(referenz, monat)),
        quelle: "Testwert (Näherung)",
      });
    }
  }
  await db.referenzzinssatz.createMany({ data: referenzzinsen });

  const plaene = p.kredite.flatMap((k) => k.tilgungsplaene.map((t) => ({ k, t, id: randomUUID() })));
  await db.tilgungsplan.createMany({
    data: plaene.map(({ k, t, id }) => ({
      id, mandantId, kreditId: kredit.get(k.schluessel)!, version: t.version, gueltigAb: tag(t.gueltigAb), bezeichnung: t.bezeichnung,
    })),
  });
  await db.tilgungsplanZeile.createMany({
    data: plaene.flatMap(({ t, id }) => t.zeilen.map((z) => ({
      mandantId, tilgungsplanId: id, faelligAm: tag(z.faelligAm),
      zins: geld(z.zins), tilgung: geld(z.tilgung), rate: geld(z.rate), restschuld: geld(z.restschuld),
    }))),
  });

  console.log(
    `Testportfolio: ${p.haeuser.length} Häuser, ${einheiten.length} Einheiten, ${mietverhaeltnisse.length} Mietverhältnisse, ` +
      `${p.kredite.length} Kredite, ${p.kredite.reduce((s, k) => s + k.buchungen.length, 0)} Kreditbuchungen.`,
  );
  return { gesellschaft, haus };
}

main()
  .catch((fehler) => {
    console.error(fehler);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
