import "server-only";
import { bereichsSicht } from "@/lib/auth/auswahl";
import type { Kontext } from "@/lib/auth/kontext";
import { idFilter } from "@/lib/auth/sichtbarkeit";
import { alsDbDatum, isoDatum, type IsoDatum } from "@/lib/datum";
import type { Formatierer } from "@/lib/format";
import { dezimal, type Decimal } from "@/lib/geld";
import { jahresNettokaltmiete } from "@/lib/miete";
import { erhoehungMoeglich, fuelleVorlage, prozentAusText, rechneErhoehung, wirksamAb, type EmpfaengerGrund, type Erhoehung, type Platzhalter } from "@/lib/serienbrief";

export interface Empfaenger {
  mietverhaeltnisId: string;
  mieter: string;
  hausId: string;
  haus: string;
  einheitId: string;
  einheit: string;
  gesellschaftId: string;
  gesellschaft: string;
  /** Anschrift des Hauses; null, wenn Straße, PLZ oder Ort fehlen */
  anschrift: string[] | null;
  miete: Decimal;
  beginn: IsoDatum;
  letzteMieterhoehung: IsoDatum | null;
  /** nur Mieterhöhung */
  erhoehung: (Erhoehung & { verlangenAb: IsoDatum; wirksamAb: IsoDatum; basis: "letzteErhoehung" | "mietbeginn" }) | null;
  /** Grund, warum kein Mieterhöhungsbrief möglich ist */
  ausgeschlossen: EmpfaengerGrund;
  werte: Partial<Record<Platzhalter, string | null>>;
  betreff: string;
  text: string;
  fehlend: Platzhalter[];
}

export interface SerienParameter {
  art: "MIETERHOEHUNG" | "ALLGEMEIN";
  betreff: string;
  text: string;
  datum: IsoDatum;
  prozent: Decimal | null;
  hausId?: string;
  gesellschaftId?: string;
  /** nur diese Mietverhältnisse */
  nur?: string[];
}

/** Laufende Mietverhältnisse der sichtbaren Häuser mit gefüllter Vorlage. */
export async function ladeEmpfaenger(kontext: Kontext, p: SerienParameter, f: Formatierer, fehltText: string): Promise<Empfaenger[]> {
  const sicht = await bereichsSicht(kontext);
  const stichtag = p.datum;
  const liste = await kontext.db.mietverhaeltnis.findMany({
    where: {
      ...(p.nur ? { id: { in: p.nur } } : {}),
      beginn: { lte: alsDbDatum(stichtag) },
      OR: [{ ende: null }, { ende: { gte: alsDbDatum(stichtag) } }],
      einheit: { hausId: idFilter(sicht.hausIds), haus: { ...(p.hausId ? { id: p.hausId } : {}), ...(p.gesellschaftId ? { gesellschaftId: p.gesellschaftId } : {}) } },
    },
    select: {
      id: true,
      beginn: true,
      istMiete: true,
      letzteMieterhoehung: true,
      mieter: { select: { name: true } },
      einheit: {
        select: {
          id: true,
          bezeichnung: true,
          art: true,
          flaeche: true,
          lage: true,
          haus: { select: { id: true, bezeichnung: true, strasse: true, plz: true, ort: true, gesellschaftId: true, gesellschaft: { select: { name: true } } } },
        },
      },
    },
  });
  const ergebnis = liste.map((m): Empfaenger => {
    const e = m.einheit;
    const h = e.haus;
    const beginn = isoDatum(m.beginn)!;
    const letzte = isoDatum(m.letzteMieterhoehung);
    const miete = dezimal(m.istMiete.toString());
    let erhoehung: Empfaenger["erhoehung"] = null;
    let ausgeschlossen: EmpfaengerGrund = null;
    if (p.art === "MIETERHOEHUNG") {
      const mo = erhoehungMoeglich({ einheitArt: e.art, beginn, letzteMieterhoehung: letzte }, stichtag);
      if (!mo.moeglich) ausgeschlossen = mo.grund;
      if (p.prozent && mo.ergebnis.art === "moeglich") erhoehung = { ...rechneErhoehung(miete, p.prozent), verlangenAb: mo.ergebnis.verlangenAb, wirksamAb: wirksamAb(mo.ergebnis.wirksamAb, stichtag), basis: mo.ergebnis.basis };
    }
    const anschrift = h.strasse && h.plz && h.ort ? [m.mieter.name, `${h.strasse}${e.lage ? `, ${e.lage}` : ""}`, `${h.plz} ${h.ort}`] : null;
    const flaeche = dezimal(e.flaeche.toString());
    const werte: Empfaenger["werte"] = {
      mieter: m.mieter.name,
      anschrift: anschrift ? anschrift.slice(1).join(", ") : null,
      haus: h.bezeichnung,
      einheit: e.bezeichnung,
      lage: e.lage,
      flaeche: flaeche.isZero() ? null : f.zahl(flaeche, 2),
      mietbeginn: f.datum(beginn),
      miete: f.betrag(miete),
      jahresmiete: f.betrag(jahresNettokaltmiete(miete)),
      letzteErhoehung: letzte ? f.datum(letzte) : null,
      gesellschaft: h.gesellschaft.name,
      datum: f.datum(p.datum),
      ...(erhoehung
        ? {
            verlangenAb: f.datum(erhoehung.verlangenAb),
            wirksamAb: f.datum(erhoehung.wirksamAb),
            neueMiete: f.betrag(erhoehung.neueMiete),
            neueJahresmiete: f.betrag(jahresNettokaltmiete(erhoehung.neueMiete)),
            erhoehungBetrag: f.betrag(erhoehung.betrag),
            erhoehungProzent: f.prozent(p.prozent!, 2),
          }
        : {}),
    };
    const betreff = fuelleVorlage(p.betreff, werte, fehltText);
    const text = fuelleVorlage(p.text, werte, fehltText);
    return {
      mietverhaeltnisId: m.id,
      mieter: m.mieter.name,
      hausId: h.id,
      haus: h.bezeichnung,
      einheitId: e.id,
      einheit: e.bezeichnung,
      gesellschaftId: h.gesellschaftId,
      gesellschaft: h.gesellschaft.name,
      anschrift,
      miete,
      beginn,
      letzteMieterhoehung: letzte,
      erhoehung,
      ausgeschlossen,
      werte,
      betreff: betreff.text,
      text: text.text,
      fehlend: [...new Set([...betreff.fehlend, ...text.fehlend])],
    };
  });
  return ergebnis.sort((a, b) => a.haus.localeCompare(b.haus) || a.einheit.localeCompare(b.einheit, "de", { numeric: true }));
}

/** Brief kann erstellt werden: nicht ausgeschlossen, keine fehlenden Werte, Anschrift bekannt. */
export const istBereit = (e: Empfaenger) => e.ausgeschlossen === null && e.fehlend.length === 0 && e.anschrift !== null;

export interface SerienAnfrage {
  vorlage?: string | null;
  haus?: string | null;
  gesellschaft?: string | null;
  prozent?: string | null;
  datum?: string | null;
}

export type SerienFehler = "vorlage" | "prozent" | "datum";

/** Liest Vorlage und Parameter einer Serie (aus der Adresszeile oder dem Formular). */
export async function leseSerie(kontext: Kontext, q: SerienAnfrage, heute: IsoDatum) {
  const vorlage = q.vorlage ? await kontext.db.briefvorlage.findFirst({ where: { id: q.vorlage } }) : null;
  if (!vorlage) return { fehler: "vorlage" as SerienFehler, vorlage: null, parameter: null };
  const datum = q.datum && /^\d{4}-\d{2}-\d{2}$/.test(q.datum) ? q.datum : heute;
  if (datum < heute) return { fehler: "datum" as SerienFehler, vorlage, parameter: null };
  const prozent = prozentAusText(q.prozent);
  if (vorlage.art === "MIETERHOEHUNG" && !prozent) return { fehler: "prozent" as SerienFehler, vorlage, parameter: null };
  const parameter: SerienParameter = {
    art: vorlage.art,
    betreff: vorlage.betreff,
    text: vorlage.text,
    datum,
    prozent: vorlage.art === "MIETERHOEHUNG" ? prozent : null,
    hausId: q.haus || undefined,
    gesellschaftId: q.gesellschaft || undefined,
  };
  return { fehler: null, vorlage, parameter };
}
