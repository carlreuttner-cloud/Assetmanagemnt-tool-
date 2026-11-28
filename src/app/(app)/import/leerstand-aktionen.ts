"use server";

import { refresh } from "next/cache";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { alsDbDatum, isoDatum, type IsoDatum } from "@/lib/datum";
import { legeStandAn, type NeueStandZeile } from "@/lib/daten/mieterstand";
import { erlaubt } from "@/lib/daten/portfolio";
import { EingabeFehler, fuehreAus } from "@/lib/formular";
import { dezimal, zuText } from "@/lib/geld";
import { dekodiere } from "@/lib/import/csv";
import { gruppiere, leseLeerstandsliste, planeLeerstandImport, type HausKandidat, type LeerstandFeld, type ZeilenStatus, type Zuordnungen } from "@/lib/import/leerstandsliste";
import { fuehreLeerstandZuordnungDurch, KiFehler, kiModus } from "@/lib/ki-claude";
import type { Nutzungsart } from "@/lib/nutzungsart";

const MAX_MB = 2;

export interface LeerstandVorschau {
  dateiname: string;
  text: string;
  spalten: LeerstandFeld[];
  zeilen: Array<{ zeile: number; hausText: string | null; einheit: string; stichtag: IsoDatum | null; status: ZeilenStatus; haus: string | null; einheitName: string | null; flaeche: string | null; erwarteteMiete: string | null }>;
  gruppen: Array<{ schluessel: string; haus: string; stichtag: IsoDatum; anzahl: number; konflikt: "vollstaendig" | "bereits" | null }>;
  hausTexte: Array<{ text: string; hausId: string | null; ki: boolean }>;
  haeuser: Array<{ id: string; bezeichnung: string }>;
  zuordnungen: Zuordnungen;
  ki: "genutzt" | "nichtGefragt" | "aus" | "fehler" | "nichtsOffen";
  kiHinweis: string | null;
}
export type LeerstandVorschauErgebnis = { fehler?: string; vorschau?: LeerstandVorschau };

async function kontextUndBestand() {
  const kontext = await pruefeZugriff("import", "schreiben");
  const sicht = await sichtbarkeit(kontext);
  const liste = await kontext.db.haus.findMany({
    where: { id: erlaubt(sicht.hausIds) },
    orderBy: { bezeichnung: "asc" },
    select: { id: true, bezeichnung: true, strasse: true, einheiten: { select: { id: true, bezeichnung: true, art: true, flaeche: true, erwarteteMiete: true } } },
  });
  const kandidaten: HausKandidat[] = liste.map((h) => ({ id: h.id, bezeichnung: h.bezeichnung, strasse: h.strasse, einheiten: h.einheiten.map((e) => ({ id: e.id, bezeichnung: e.bezeichnung })) }));
  return { kontext, t: texte(kontext.mandant.sprache), liste, kandidaten };
}

function leseZuordnungen(fd: FormData, kandidaten: HausKandidat[]): Zuordnungen {
  const z: Zuordnungen = { haeuser: {}, einheiten: {}, ki: [] };
  try {
    const roh = JSON.parse(String(fd.get("zuordnungen") ?? "{}")) as Partial<Zuordnungen>;
    if (roh.einheiten && typeof roh.einheiten === "object") for (const [k, v] of Object.entries(roh.einheiten)) if (typeof v === "string") z.einheiten[k] = v;
    if (Array.isArray(roh.ki)) z.ki = roh.ki.filter((x): x is string => typeof x === "string");
    if (roh.haeuser && typeof roh.haeuser === "object") for (const [k, v] of Object.entries(roh.haeuser)) if (typeof v === "string") z.haeuser[k] = v;
  } catch {
    // ungültig: ohne Vorgaben weiter
  }
  // Auswahl in der Vorschau: Felder haus:<Text> = hausId (leer = nicht zuordnen)
  const ids = new Set(kandidaten.map((h) => h.id));
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("haus:") || typeof v !== "string") continue;
    const text = k.slice(5);
    if (v && ids.has(v)) z.haeuser[text] = v;
    else delete z.haeuser[text];
  }
  for (const [k, v] of Object.entries(z.haeuser)) if (!ids.has(v)) delete z.haeuser[k];
  return z;
}

async function konflikte(kontext: Awaited<ReturnType<typeof pruefeZugriff>>, gruppen: Array<{ hausId: string; stichtag: IsoDatum }>, quelle: string) {
  if (gruppen.length === 0) return new Map<string, "vollstaendig" | "bereits">();
  const vorhanden = await kontext.db.mieterstand.findMany({
    where: { hausId: { in: [...new Set(gruppen.map((g) => g.hausId))] }, stichtag: { in: [...new Set(gruppen.map((g) => alsDbDatum(g.stichtag)))] } },
    select: { hausId: true, stichtag: true, art: true, quelle: true },
  });
  const m = new Map<string, "vollstaendig" | "bereits">();
  for (const s of vorhanden) {
    const k = `${s.hausId}|${isoDatum(s.stichtag)}`;
    if (s.art === "VOLLSTAENDIG") m.set(k, "vollstaendig");
    else if (s.quelle === quelle && !m.has(k)) m.set(k, "bereits");
  }
  return m;
}

/** Liest die Datei (oder den Text einer früheren Vorschau) und zeigt die Zuordnung je Zeile. */
export async function leerstandVorschau(_v: LeerstandVorschauErgebnis, fd: FormData): Promise<LeerstandVorschauErgebnis> {
  let vorschau: LeerstandVorschau | undefined;
  const ergebnis = await fuehreAus(async () => {
    const { kontext, t, liste: bestand, kandidaten } = await kontextUndBestand();
    const ti = t.importe;
    const tl = t.leerstandImport;
    let dateiname = String(fd.get("dateiname") ?? "");
    let text = String(fd.get("text") ?? "");
    const datei = fd.get("datei");
    if (datei instanceof File && datei.size > 0) {
      if (datei.size > MAX_MB * 1024 * 1024) throw new EingabeFehler(fuelle(ti.dateiZuGross, { mb: MAX_MB }));
      dateiname = datei.name.slice(0, 200);
      text = dekodiere(new Uint8Array(await datei.arrayBuffer()));
    }
    if (!text) throw new EingabeFehler(ti.keineDatei);
    const liste = leseLeerstandsliste(text);
    if (liste.fehler) throw new EingabeFehler(tl.keineTabelle);
    if (liste.zeilen.length === 0) throw new EingabeFehler(tl.keineZeilen);
    const zuordnungen = leseZuordnungen(fd, kandidaten);
    let plan = planeLeerstandImport(liste, kandidaten, zuordnungen);

    // KI nur auf Wunsch und nur für offene Angaben; Ergebnis ist ein Vorschlag zur Bestätigung
    let ki: LeerstandVorschau["ki"] = "nichtGefragt";
    let kiHinweis: string | null = null;
    if (fd.get("ki") === "1") {
      const offen = {
        haeuser: [...new Set(plan.filter((z) => z.status === "hausUnbekannt" && z.hausText).map((z) => z.hausText!))],
        einheiten: [...new Map(plan.filter((z) => z.status === "einheitUnbekannt" && z.hausId).map((z) => [`${z.hausId}|${z.einheit}`, { hausId: z.hausId!, text: z.einheit }])).values()],
      };
      if (offen.haeuser.length + offen.einheiten.length === 0) ki = "nichtsOffen";
      else if (kiModus() !== "claude") ki = "aus";
      else {
        try {
          const antwort = await fuehreLeerstandZuordnungDurch(offen, kandidaten, t);
          Object.assign(zuordnungen.haeuser, antwort.zuordnungen.haeuser);
          Object.assign(zuordnungen.einheiten, antwort.zuordnungen.einheiten);
          zuordnungen.ki = [...new Set([...(zuordnungen.ki ?? []), ...(antwort.zuordnungen.ki ?? [])])];
          plan = planeLeerstandImport(liste, kandidaten, zuordnungen);
          ki = "genutzt";
          kiHinweis = antwort.modell;
        } catch (e) {
          if (!(e instanceof KiFehler)) throw e;
          ki = "fehler";
          kiHinweis = e.message;
        }
      }
    }

    const hausName = new Map(bestand.map((h) => [h.id, h.bezeichnung]));
    const einheitName = new Map(bestand.flatMap((h) => h.einheiten.map((e) => [e.id, e] as const)));
    const gruppen = gruppiere(plan);
    const k = await konflikte(kontext, gruppen, dateiname);
    const texteHaus = [...new Set(liste.zeilen.map((z) => z.hausText).filter((x): x is string => !!x))];
    vorschau = {
      dateiname,
      text,
      spalten: liste.spalten,
      zeilen: plan.map((z) => {
        const e = z.einheitId ? einheitName.get(z.einheitId) : undefined;
        return {
          zeile: z.zeile,
          hausText: z.hausText,
          einheit: z.einheit,
          stichtag: z.stichtag,
          status: z.status,
          haus: z.hausId ? (hausName.get(z.hausId) ?? null) : null,
          einheitName: e?.bezeichnung ?? null,
          flaeche: zuText(z.flaeche ?? (e ? dezimal(e.flaeche) : null)),
          erwarteteMiete: zuText(z.erwarteteMiete ?? (e?.erwarteteMiete ? dezimal(e.erwarteteMiete) : null)),
        };
      }),
      gruppen: gruppen.map((g) => ({ schluessel: `${g.hausId}|${g.stichtag}`, haus: hausName.get(g.hausId) ?? g.hausId, stichtag: g.stichtag, anzahl: g.zeilen.length, konflikt: k.get(`${g.hausId}|${g.stichtag}`) ?? null })),
      hausTexte: texteHaus.map((x) => {
        const z = plan.find((p) => p.hausText === x);
        return { text: x, hausId: z?.hausId ?? null, ki: (zuordnungen.ki ?? []).includes(x) };
      }),
      haeuser: bestand.map((h) => ({ id: h.id, bezeichnung: h.bezeichnung })),
      zuordnungen,
      ki,
      kiHinweis,
    };
  });
  return vorschau ? { vorschau } : ergebnis;
}

/**
 * Legt je bestätigter Gruppe (Haus × Stichtag) einen Stand „nur Leerstandsdaten“ an. Der Stand
 * enthält alle Einheiten des Hauses: genannte als leer, die übrigen als unbekannt (oder als
 * vermietet, wenn die Liste ausdrücklich vollständig ist). Mieten bleiben unbekannt.
 */
export async function leerstandUebernehmen(_v: { fehler?: string; ok?: string }, fd: FormData) {
  return fuehreAus(async () => {
    const { kontext, t, liste: bestand, kandidaten } = await kontextUndBestand();
    const tl = t.leerstandImport;
    const text = String(fd.get("text") ?? "");
    const dateiname = String(fd.get("dateiname") ?? "leerstandsliste.csv").slice(0, 200);
    if (!text) throw new EingabeFehler(t.importe.keineDatei);
    const liste = leseLeerstandsliste(text);
    if (liste.fehler) throw new EingabeFehler(tl.keineTabelle);
    const plan = planeLeerstandImport(liste, kandidaten, leseZuordnungen(fd, kandidaten));
    const gewaehlt = new Set(fd.getAll("gruppe").map(String));
    const vollstaendig = fd.get("vollstaendig") === "1";
    const gruppen = gruppiere(plan).filter((g) => gewaehlt.has(`${g.hausId}|${g.stichtag}`));
    if (gruppen.length === 0) throw new EingabeFehler(tl.keineAuswahl);
    const k = await konflikte(kontext, gruppen, dateiname);
    const nachHaus = new Map(bestand.map((h) => [h.id, h]));
    const vorgang = await kontext.db.importvorgang.create({
      data: { art: "LEERSTANDSLISTE", dateiname, benutzerId: kontext.benutzer.id, hausId: null, ergebnis: {} } as never,
    });
    let staende = 0;
    let leer = 0;
    let uebersprungen = 0;
    for (const g of gruppen) {
      if (k.has(`${g.hausId}|${g.stichtag}`)) {
        uebersprungen++;
        continue;
      }
      const h = nachHaus.get(g.hausId)!;
      const genannt = new Map(g.zeilen.map((z) => [z.einheitId!, z]));
      const zeilen: NeueStandZeile[] = h.einheiten.map((e) => {
        const z = genannt.get(e.id);
        return {
          einheitId: e.id,
          einheit: e.bezeichnung,
          art: e.art as Nutzungsart,
          flaeche: z?.flaeche ?? dezimal(e.flaeche),
          leer: z ? true : vollstaendig ? false : null,
          mieter: null,
          beginn: null,
          ende: null,
          sollMiete: null,
          istMiete: null,
          nebenkosten: null,
          erwarteteMiete: z ? (z.erwarteteMiete ?? (e.erwarteteMiete ? dezimal(e.erwarteteMiete) : null)) : null,
        };
      });
      await legeStandAn(kontext.db, { hausId: g.hausId, stichtag: g.stichtag, art: "NUR_LEERSTAND", quelle: dateiname, importvorgangId: vorgang.id, erstelltVon: kontext.benutzer.name }, zeilen);
      staende++;
      leer += g.zeilen.length;
    }
    const offen = plan.filter((z) => z.status !== "zugeordnet" && z.status !== "ki").length;
    await kontext.db.importvorgang.update({ where: { id: vorgang.id }, data: { ergebnis: { staende, leerstaende: leer, uebersprungen, offen } } });
    refresh();
    return { ok: fuelle(tl.uebernommen, { staende, leer, uebersprungen }) };
  });
}
