/**
 * Testdaten Stände der Mieterliste: je Haus sechs Monatsstände. Der neueste Stand entspricht dem
 * Bestand zum letzten Monatsende; die älteren Stände werden daraus rückwärts mit typischen
 * Änderungen abgeleitet (Mieterhöhung, Minderung, Mieterwechsel, neuer und beendeter Leerstand,
 * Flächenkorrektur). In einem Stand fehlen einzelne Werte (unbekannt). Alles erfunden (Testdaten).
 */
import type { PrismaClient } from "../../src/generated/prisma/client";
import { isoDatum, monatsende, monatsNummer } from "../../src/lib/datum";
import { aufCent, dezimal, type Decimal } from "../../src/lib/geld";

type Art = "WOHNUNG" | "GEWERBE" | "STELLPLATZ";
interface Zeile {
  einheitId: string;
  einheit: string;
  art: Art;
  flaeche: Decimal | null;
  leer: boolean | null;
  mieter: string | null;
  beginn: string | null;
  ende: string | null;
  sollMiete: Decimal | null;
  istMiete: Decimal | null;
  nebenkosten: Decimal | null;
  erwarteteMiete: Decimal | null;
}

const OPS = ["mieterhoehung", "neuerLeerstand", "mieterwechsel", "neuvermietung", "minderung", "korrektur"] as const;
type Op = (typeof OPS)[number];
export const STAND_ANZAHL = 6;

/** Macht eine Vorwärts-Änderung im älteren Stand rückgängig. */
function rueckwaerts(stand: Zeile[], op: Op, wahl: number) {
  const vermietet = stand.filter((z) => z.leer === false && z.istMiete !== null);
  const leer = stand.filter((z) => z.leer === true);
  const pick = <T,>(l: T[]) => (l.length ? l[wahl % l.length] : null);
  switch (op) {
    case "mieterhoehung": {
      const z = pick(vermietet.filter((x) => x.art === "WOHNUNG"));
      if (z) { z.istMiete = aufCent(z.istMiete!.dividedBy("1.06")); z.sollMiete = z.istMiete; }
      break;
    }
    case "minderung": {
      const z = pick(vermietet);
      if (z) z.istMiete = aufCent(z.istMiete!.times("1.1"));
      break;
    }
    case "neuerLeerstand": {
      // jetzt leer, vorher vermietet
      const z = pick(leer);
      if (z) {
        const miete = z.erwarteteMiete ?? aufCent((z.flaeche ?? dezimal(50)).times(9));
        Object.assign(z, { leer: false, mieter: `Vormieter ${z.einheit}`, beginn: "2018-04-01", sollMiete: miete, istMiete: miete, nebenkosten: z.flaeche ? aufCent(z.flaeche.times("2.6")) : null, erwarteteMiete: null });
      }
      break;
    }
    case "neuvermietung": {
      // jetzt vermietet, vorher leer
      const z = pick(vermietet);
      if (z) Object.assign(z, { leer: true, mieter: null, beginn: null, ende: null, erwarteteMiete: z.sollMiete, sollMiete: null, istMiete: null, nebenkosten: null });
      break;
    }
    case "mieterwechsel": {
      const z = pick(vermietet);
      if (z) Object.assign(z, { mieter: `Vormieter ${z.einheit}`, beginn: "2017-09-01" });
      break;
    }
    case "korrektur": {
      const z = pick(stand.filter((x) => x.art !== "STELLPLATZ" && x.flaeche));
      if (z) z.flaeche = z.flaeche!.plus("2.5");
      break;
    }
  }
}

export async function baueMieterstaende(db: PrismaClient, mandantId: string, heute = new Date().toISOString().slice(0, 10)) {
  const letzter = monatsNummer(heute) - 1;
  const stichtage = Array.from({ length: STAND_ANZAHL }, (_, i) => monatsende(letzter - (STAND_ANZAHL - 1) + i));
  const neuester = stichtage.at(-1)!;
  const haeuser = await db.haus.findMany({
    where: { mandantId },
    orderBy: { bezeichnung: "asc" },
    select: { id: true, einheiten: { orderBy: { bezeichnung: "asc" }, include: { mietverhaeltnisse: { include: { mieter: { select: { name: true } } } } } } },
  });
  for (const [i, h] of haeuser.entries()) {
    if (h.einheiten.length === 0) continue;
    const aktuell: Zeile[] = h.einheiten.map((e) => {
      const m = e.mietverhaeltnisse.find((x) => isoDatum(x.beginn) <= neuester && (!x.ende || isoDatum(x.ende) >= neuester));
      const flaeche = e.art === "STELLPLATZ" ? null : dezimal(e.flaeche);
      return {
        einheitId: e.id,
        einheit: e.bezeichnung,
        art: e.art,
        flaeche,
        leer: !m,
        mieter: m?.mieter.name ?? null,
        beginn: m ? isoDatum(m.beginn) : null,
        ende: m ? isoDatum(m.ende) : null,
        sollMiete: m ? dezimal(m.sollMiete) : null,
        istMiete: m ? dezimal(m.istMiete) : null,
        // Stellplätze ohne Nebenkosten; für leere Einheiten gibt es keine Vorauszahlung
        nebenkosten: m && flaeche ? aufCent(flaeche.times("2.5")) : null,
        erwarteteMiete: !m && e.erwarteteMiete ? dezimal(e.erwarteteMiete) : null,
      };
    });
    const staende: Zeile[][] = [aktuell];
    for (let k = STAND_ANZAHL - 2; k >= 0; k--) {
      const alt = staende[0].map((z) => ({ ...z }));
      rueckwaerts(alt, OPS[(i + k) % OPS.length], i * 7 + k * 3);
      if ((i + k) % 2 === 0) rueckwaerts(alt, OPS[(i + k + 3) % OPS.length], i * 5 + k);
      // ältere Nebenkostenvorauszahlungen etwas niedriger (neutrale Änderung)
      if (k === 1 && i % 4 === 0) for (const z of alt) if (z.nebenkosten) z.nebenkosten = aufCent(z.nebenkosten.times("0.95"));
      staende.unshift(alt);
    }
    // Datenlücke: im zweiten Stand des ersten Hauses fehlen Ist-Miete und Nebenkosten einer Einheit
    if (i === 0) {
      const z = staende[1].find((x) => x.leer === false);
      if (z) { z.istMiete = null; z.nebenkosten = null; }
    }
    for (const [k, zeilen] of staende.entries()) {
      const stand = await db.mieterstand.create({
        data: { mandantId, hausId: h.id, stichtag: new Date(`${stichtage[k]}T00:00:00Z`), art: "VOLLSTAENDIG", quelle: `Mieterliste ${stichtage[k].slice(0, 7)}.csv (Testdaten)`, erstelltVon: "Testdaten" },
      });
      await db.mieterstandZeile.createMany({
        data: zeilen.map((z) => ({
          mandantId,
          standId: stand.id,
          einheitId: z.einheitId,
          einheit: z.einheit,
          art: z.art,
          flaeche: z.flaeche === null ? null : z.flaeche.toFixed(2),
          leer: z.leer,
          mieter: z.mieter,
          beginn: z.beginn ? new Date(`${z.beginn}T00:00:00Z`) : null,
          ende: z.ende ? new Date(`${z.ende}T00:00:00Z`) : null,
          sollMiete: z.sollMiete === null ? null : z.sollMiete.toFixed(2),
          istMiete: z.istMiete === null ? null : z.istMiete.toFixed(2),
          nebenkosten: z.nebenkosten === null ? null : z.nebenkosten.toFixed(2),
          erwarteteMiete: z.erwarteteMiete === null ? null : z.erwarteteMiete.toFixed(2),
        })),
      });
    }
  }
}
