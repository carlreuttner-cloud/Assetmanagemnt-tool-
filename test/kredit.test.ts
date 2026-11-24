import { describe, expect, it } from "vitest";
import { dezimal } from "@/lib/geld";
import { hausKennzahlen, gruppenKennzahlen, covenantKennzahlen } from "@/lib/kennzahlen";
import {
  berechneTilgungsplan,
  kapitaldienstJahr,
  pruefeCovenant,
  planRestschuld,
  restschuld,
  restschuldNachweis,
  saldenJahresvergleich,
  sortiereBuchungen,
  zinsbindung,
  zinssatz,
  type KreditDaten,
} from "@/lib/kredit";
import { erzeugePortfolio, kennzahlen, STICHTAG } from "../prisma/testdaten/portfolio";
import { alsDaten } from "./hilfen/testportfolio";

const p = erzeugePortfolio();
const soll = kennzahlen(p);
const { haeuser, kredite } = alsDaten(p);

describe("Restschuld und Kennzahlen gegen die Sollwerte der Testdaten", () => {
  it("Restschuld je Kredit am Stichtag entspricht dem Generator", () => {
    for (const k of p.kredite) {
      const daten = kredite.find((x) => x.id === k.schluessel)!;
      expect(restschuld(daten, STICHTAG)!.toFixed(2), k.schluessel).toBe(k.restschuldStichtag.toFixed(2));
    }
  });

  it("Miete, Leerstand, Restschuld und LTV je Haus stimmen", () => {
    for (const s of soll) {
      const h = haeuser.find((x) => x.id === s.haus)!;
      const ist = hausKennzahlen(h, kredite, [], STICHTAG);
      expect(ist.sollMonat.toFixed(2), s.haus).toBe(s.sollMonat.toFixed(2));
      expect(ist.istMonat.toFixed(2), s.haus).toBe(s.istMonat.toFixed(2));
      expect(ist.erwartetLeerMonat.toFixed(2), s.haus).toBe(s.erwartetLeerMonat.toFixed(2));
      expect(ist.leerstandQuote!.toFixed(4), s.haus).toBe(s.leerstandProzent.toFixed(4));
      expect(ist.restschuld.toFixed(2), s.haus).toBe(s.restschuld.toFixed(2));
      expect(ist.ltv!.toFixed(4), s.haus).toBe(s.ltv.toFixed(4));
      expect(ist.kaufpreisfaktor!.toFixed(4), s.haus).toBe(s.faktor.toFixed(4));
    }
  });

  it("Portfolio-Restschuld = Summe der Kredite = Summe der anteiligen Hausschulden", () => {
    const gesamt = gruppenKennzahlen(haeuser, kredite, [], STICHTAG);
    const summeHaeuser = soll.reduce((s, x) => s.plus(x.restschuld), dezimal(0));
    expect(gesamt.restschuld.toFixed(2)).toBe(summeHaeuser.toFixed(2));
    expect(gesamt.haeuser).toBe(15);
    expect(gesamt.sollJahr.toFixed(2)).toBe(gesamt.sollMonat.times(12).toFixed(2));
  });

  it("erkennt die Covenant-Verletzung bei K12 (LTV höchstens 65 %)", () => {
    const k12 = kredite.find((k) => k.id === "K12")!;
    const werte = covenantKennzahlen(k12, haeuser, kredite, [], STICHTAG);
    const ergebnis = pruefeCovenant({ kennzahl: "LTV", vergleich: "HOECHSTENS", schwellenwert: dezimal(65) }, { LTV: werte.ltv });
    expect(ergebnis.eingehalten).toBe(false);
    expect(ergebnis.wert!.greaterThan(65)).toBe(true);
  });

  it("Kapitaldienst der letzten 12 Monate aus den Buchungen", () => {
    const k01 = kredite.find((k) => k.id === "K01")!;
    const kd = kapitaldienstJahr(k01, [], STICHTAG);
    expect(kd!.quelle).toBe("buchungen");
    // monatliche Annuität: 12 Raten
    expect(kd!.summe.toFixed(2)).toBe(k01.ratenbetrag!.times(12).toFixed(2));
  });
});

describe("Kreditfunktionen", () => {
  const basis: KreditDaten = {
    id: "x", gesellschaftId: "g", bezeichnung: "Test", zinsArt: "VARIABEL", sollzins: null, referenzzins: "3M-EURIBOR",
    marge: dezimal("1.5"), ursprungsbetrag: dezimal(1_000_000), auszahlungsdatum: "2020-01-01", zinsbindungBis: null,
    laufzeitBis: null, zahlweise: "MONATLICH", tilgungsart: "ANNUITAET", anfaenglicheTilgung: dezimal(2), ratenbetrag: null,
    haeuser: [], buchungen: [], tilgungsplaene: [],
  };

  it("variabler Zins: Referenzzins mit Floor 0 % plus Marge", () => {
    const werte = [
      { referenz: "3M-EURIBOR", stichtag: "2021-01-01", satz: dezimal("-0.55") },
      { referenz: "3M-EURIBOR", stichtag: "2024-01-01", satz: dezimal("3.93") },
    ];
    expect(zinssatz(basis, werte, "2021-06-30")!.toFixed(2)).toBe("1.50");
    expect(zinssatz(basis, werte, "2024-06-30")!.toFixed(2)).toBe("5.43");
    expect(zinssatz(basis, werte, "2019-01-01")).toBeNull();
  });

  it("ohne Beleg: Restschuld unbekannt (nie Ursprungsbetrag), vor Auszahlung 0", () => {
    expect(restschuld(basis, "2025-01-01")).toBeNull();
    expect(restschuld(basis, "2019-12-31")!.toFixed(2)).toBe("0.00");
    expect(kapitaldienstJahr(basis, [], "2025-01-01")).toBeNull();
  });

  it("Restschuld nur aus belegten Darlehenssalden, nicht aus Entwürfen, Guthaben, unklaren Stichtagen oder Plänen", () => {
    const k: KreditDaten = {
      ...basis,
      salden: [
        { stichtag: "2023-12-31", art: "DARLEHEN", betrag: dezimal(950_000), quelle: "JAHRESABSCHLUSS", status: "BELEGT" },
        { stichtag: "2024-12-31", art: "DARLEHEN", betrag: dezimal(930_000), quelle: "BANKBESTAETIGUNG", status: "ENTWURF" },
        { stichtag: "2024-12-31", art: "GUTHABEN", betrag: dezimal(20_000), quelle: "KONTOAUSZUG", status: "BELEGT" },
        { stichtag: null, stichtagHinweis: "Ende 2024?", art: "DARLEHEN", betrag: dezimal(900_000), quelle: "SONSTIGE", status: "BELEGT" },
      ],
      tilgungsplaene: [{ version: 1, gueltigAb: "2020-01-01", zeilen: [{ faelligAm: "2024-12-31", zins: dezimal(1), tilgung: dezimal(1), rate: dezimal(2), restschuld: dezimal(925_000) }] }],
    };
    const n = restschuldNachweis(k, "2025-06-30")!;
    expect(n.betrag.toFixed(2)).toBe("950000.00");
    expect(n.stichtag).toBe("2023-12-31");
    expect(n.herkunft).toBe("saldo");
    expect(planRestschuld(k, "2025-06-30")!.toFixed(2)).toBe("925000.00");
    // jüngerer Kontostand aus einer Bankbuchung gewinnt
    const mitBuchung = { ...k, buchungen: [{ datum: "2025-03-31", art: "TILGUNG" as const, betrag: dezimal(5000), saldoNach: dezimal(940_000) }] };
    expect(restschuldNachweis(mitBuchung, "2025-06-30")!.herkunft).toBe("buchung");
    expect(restschuld(mitBuchung, "2025-06-30")!.toFixed(2)).toBe("940000.00");

    const vergleich = saldenJahresvergleich(mitBuchung);
    expect(vergleich.jahre.map((j) => [j.jahr, j.saldo.betrag.toFixed(0), j.saldo.status])).toEqual([
      [2023, "950000", "BELEGT"],
      [2024, "930000", "ENTWURF"],
      [2025, "940000", "BELEGT"],
    ]);
    expect(vergleich.jahre[1].veraenderung!.toFixed(0)).toBe("-20000");
    expect(vergleich.jahre[1].plan!.toFixed(0)).toBe("925000");
    expect(vergleich.unklar).toHaveLength(1);
    expect(saldenJahresvergleich(mitBuchung, "GUTHABEN").jahre.map((j) => j.saldo.betrag.toFixed(0))).toEqual(["20000"]);
  });

  it("Buchungen am selben Tag: Tilgung nach Zins", () => {
    const sortiert = sortiereBuchungen([
      { datum: "2025-01-31", art: "TILGUNG" as const },
      { datum: "2025-01-31", art: "ZINS" as const },
      { datum: "2024-12-31", art: "TILGUNG" as const },
    ]);
    expect(sortiert.map((b) => `${b.datum} ${b.art}`)).toEqual(["2024-12-31 TILGUNG", "2025-01-31 ZINS", "2025-01-31 TILGUNG"]);
  });

  it("Zinsbindung: Stufen nach Restlaufzeit", () => {
    const fest = { zinsArt: "FEST" as const };
    expect(zinsbindung({ ...fest, zinsbindungBis: "2026-11-30" }, "2026-11-23").stufe).toBe("unter12");
    expect(zinsbindung({ ...fest, zinsbindungBis: "2028-06-30" }, "2026-11-23").stufe).toBe("unter24");
    expect(zinsbindung({ ...fest, zinsbindungBis: "2025-06-30" }, "2026-11-23").stufe).toBe("abgelaufen");
    expect(zinsbindung({ zinsArt: "VARIABEL", zinsbindungBis: null }, "2026-11-23").stufe).toBe("keine");
  });

  it("Annuitätenplan: konstante Rate, Restschuld sinkt, Zins + Tilgung = Rate", () => {
    const zeilen = berechneTilgungsplan({
      saldo: dezimal(100_000), ab: "2026-01-01", zinssatz: dezimal(3), zahlweise: "MONATLICH",
      tilgungsart: "ANNUITAET", tilgungProzent: dezimal(2), bis: "2026-12-31",
    });
    expect(zeilen).toHaveLength(12);
    expect(zeilen[0].faelligAm).toBe("2026-01-31");
    expect(zeilen[0].zins.toFixed(2)).toBe("250.00");
    expect(zeilen[0].rate.toFixed(2)).toBe("416.67");
    for (const z of zeilen) expect(z.zins.plus(z.tilgung).toFixed(2)).toBe("416.67");
    expect(zeilen[11].restschuld.lessThan(zeilen[0].restschuld)).toBe(true);
  });

  it("Plan bis zur vollständigen Tilgung endet bei 0", () => {
    const zeilen = berechneTilgungsplan({
      saldo: dezimal(10_000), ab: "2026-01-01", zinssatz: dezimal(5), zahlweise: "QUARTALSWEISE",
      tilgungsart: "RATENTILGUNG", ratenbetrag: dezimal(1000),
    });
    expect(zeilen).toHaveLength(10);
    expect(zeilen[0].faelligAm).toBe("2026-03-31");
    expect(zeilen[9].restschuld.toFixed(2)).toBe("0.00");
  });
});

describe("Unbekannt statt 0", () => {
  it("Haus ohne Verkehrswert und Kredit ohne Beleg: Quoten unbekannt, Lücken gezählt", () => {
    const h = { ...haeuser[0], verkehrswerte: [], kaufpreis: null };
    const k = { ...kredite.find((x) => x.haeuser.some((a) => a.hausId === h.id))!, buchungen: [], salden: [] };
    const kz = hausKennzahlen(h, [k], [], STICHTAG);
    expect(kz.ltv).toBeNull();
    expect(kz.mietrendite).toBeNull();
    expect(kz.kaufpreisfaktor).toBeNull();
    expect(kz.luecken.verkehrswert).toMatchObject({ bekannt: 0, fehlend: 1 });
    expect(kz.luecken.restschuld).toMatchObject({ bekannt: 0, fehlend: 1 });
    // Kapitaldienst aus Buchungen fehlt, Hochrechnung braucht belegte Restschuld: unbekannt
    expect(kz.dscr).toBeNull();
  });

  it("Verkehrswert vor dem ersten Gutachten ist unbekannt, nicht der spätere Wert", () => {
    const h = { ...haeuser[0], verkehrswerte: [{ stichtag: "2025-01-01", wert: dezimal(1_000_000) }] };
    const kz = hausKennzahlen(h, [], [], "2024-06-30");
    expect(kz.luecken.verkehrswert.fehlend).toBe(1);
  });

  it("Gruppe: Spanne der Saldo-Stichtage wird festgehalten", () => {
    const kz = gruppenKennzahlen(haeuser, kredite, [], STICHTAG);
    expect(kz.luecken.restschuld.fehlend).toBe(0);
    expect(kz.luecken.restschuld.bis).toBe(STICHTAG);
  });
});

describe("Jahresvergleich mit Bankbuchungen", () => {
  it("nimmt am selben Tag den Kontostand nach der letzten Buchung (Tilgung nach Zins)", () => {
    for (const k of kredite) {
      const v = saldenJahresvergleich(k);
      const letztes = v.jahre[v.jahre.length - 1];
      expect(letztes.saldo.betrag.toFixed(2), k.id).toBe(restschuld(k, letztes.saldo.stichtag)!.toFixed(2));
    }
  });
});
