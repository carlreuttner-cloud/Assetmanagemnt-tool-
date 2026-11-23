import "server-only";
import { basisDb } from "./client";

/**
 * Mandantenfähiger Datenbankzugriff.
 *
 * `mandantDb({ mandantId, benutzerId })` liefert einen Prisma-Client, der
 *  1. bei jedem Lesen, Ändern und Löschen automatisch `mandantId` in die Bedingung setzt,
 *  2. bei jedem Anlegen `mandantId` setzt (abweichende Werte werden abgelehnt),
 *  3. prüft, dass verknüpfte Datensätze (hausId, kreditId, ...) zum selben Mandanten gehören,
 *  4. jede Änderung ins Änderungsprotokoll schreibt.
 *
 * Bekannte Grenze: Verschachtelte Schreibvorgänge (z. B. `create` mit `einheiten: { create: ... }`)
 * werden nicht durchgereicht. Sie scheitern an der Pflichtspalte `mandantId`, sind also nicht
 * unsicher, aber auch nicht nutzbar. Bitte Datensätze einzeln anlegen.
 */

export type DbKontext = {
  mandantId: string;
  /** Wer die Änderung auslöst; null für Systemvorgänge (z. B. Seed). */
  benutzerId: string | null;
};

/** Modelle ohne eigene Spalte `mandantId`. */
const OHNE_MANDANT = new Set(["Mandant", "Benutzer"]);
/** Modelle, deren Änderungen nicht protokolliert werden. */
const OHNE_PROTOKOLL = new Set(["Aenderungsprotokoll", "Mandant", "Benutzer"]);

/** Fremdschlüssel, deren Ziel zum selben Mandanten gehören muss. */
const FREMDSCHLUESSEL: Record<string, string> = {
  gesellschaftId: "gesellschaft",
  hausId: "haus",
  einheitId: "einheit",
  mieterId: "mieter",
  mietverhaeltnisId: "mietverhaeltnis",
  kreditId: "kredit",
  tilgungsplanId: "tilgungsplan",
  mitgliedschaftId: "mitgliedschaft",
};
/** Gleiche Prüfung für die Relationsschreibweise `haus: { connect: { id } }`. */
const RELATIONEN: Record<string, string> = Object.fromEntries(
  Object.values(FREMDSCHLUESSEL).map((m) => [m, m]),
);

type Daten = Record<string, unknown>;
type Delegate = {
  findUnique(args: unknown): Promise<Daten | null>;
  findMany(args: unknown): Promise<Daten[]>;
  count(args: unknown): Promise<number>;
};

function delegate(name: string): Delegate {
  const schluessel = name.charAt(0).toLowerCase() + name.slice(1);
  return (basisDb as unknown as Record<string, Delegate>)[schluessel];
}

function alsJson(wert: unknown) {
  // Decimal und Date werden dabei zu Text; genau so soll es im Protokoll stehen.
  return wert == null ? undefined : JSON.parse(JSON.stringify(wert));
}

function istRelationsObjekt(wert: unknown): wert is Daten {
  return (
    typeof wert === "object" &&
    wert !== null &&
    ("connect" in wert || "create" in wert || "connectOrCreate" in wert)
  );
}

export function mandantDb(ctx: DbKontext) {
  const { mandantId, benutzerId } = ctx;
  if (!mandantId) throw new Error("mandantDb ohne mandantId aufgerufen");

  function mitMandant(where: unknown): Daten {
    const w = (where ?? {}) as Daten;
    if (w.mandantId !== undefined && w.mandantId !== mandantId) {
      throw new Error("Zugriff auf fremden Mandanten verweigert");
    }
    return { ...w, mandantId };
  }

  function datenMitMandant(daten: unknown): Daten {
    const d = { ...((daten ?? {}) as Daten) };
    if (d.mandantId !== undefined && d.mandantId !== mandantId) {
      throw new Error("Anlegen für fremden Mandanten verweigert");
    }
    if ("mandant" in d) throw new Error("Relation `mandant` wird automatisch gesetzt");
    // Prisma erlaubt keine Mischung aus Skalar-FK und Relationsobjekten.
    if (Object.values(d).some(istRelationsObjekt)) {
      delete d.mandantId;
      d.mandant = { connect: { id: mandantId } };
    } else {
      d.mandantId = mandantId;
    }
    return d;
  }

  async function pruefeVerknuepfungen(daten: unknown) {
    if (!daten || typeof daten !== "object") return;
    const d = daten as Daten;
    const pruefungen: Array<[string, string]> = [];
    for (const [feld, modell] of Object.entries(FREMDSCHLUESSEL)) {
      const id = d[feld];
      if (typeof id === "string") pruefungen.push([modell, id]);
    }
    for (const [feld, modell] of Object.entries(RELATIONEN)) {
      const rel = d[feld] as Daten | undefined;
      const id = (rel?.connect as Daten | undefined)?.id;
      if (typeof id === "string") pruefungen.push([modell, id]);
    }
    for (const [modell, id] of pruefungen) {
      const anzahl = await delegate(modell).count({ where: { id, mandantId } });
      if (anzahl === 0) {
        throw new Error(`Verknüpfter Datensatz ${modell}/${id} gehört nicht zu diesem Mandanten`);
      }
    }
  }

  async function protokolliere(
    tabelle: string,
    eintraege: Array<{ id: string; aktion: "ERSTELLT" | "GEAENDERT" | "GELOESCHT"; alt?: unknown; neu?: unknown }>,
  ) {
    if (OHNE_PROTOKOLL.has(tabelle) || eintraege.length === 0) return;
    await basisDb.aenderungsprotokoll.createMany({
      data: eintraege.map((e) => ({
        mandantId,
        benutzerId,
        tabelle,
        datensatzId: e.id,
        aktion: e.aktion,
        alteWerte: alsJson(e.alt),
        neueWerte: alsJson(e.neu),
      })),
    });
  }

  return basisDb.$extends({
    name: "mandant",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || OHNE_MANDANT.has(model)) return query(args);
          const a = { ...(args as Daten) };
          const tabelle = delegate(model);

          switch (operation) {
            case "findUnique":
            case "findUniqueOrThrow":
            case "findFirst":
            case "findFirstOrThrow":
            case "findMany":
            case "count":
            case "aggregate":
            case "groupBy":
              a.where = mitMandant(a.where);
              return query(a as typeof args);

            case "create": {
              a.data = datenMitMandant(a.data);
              await pruefeVerknuepfungen(a.data);
              const neu = (await query(a as typeof args)) as Daten;
              await protokolliere(model, [{ id: neu.id as string, aktion: "ERSTELLT", neu }]);
              return neu;
            }

            case "createMany":
            case "createManyAndReturn": {
              const liste = Array.isArray(a.data) ? a.data : [a.data];
              a.data = liste.map((d) => datenMitMandant(d));
              for (const d of a.data as Daten[]) await pruefeVerknuepfungen(d);
              if (operation === "createMany" && !OHNE_PROTOKOLL.has(model)) {
                // Für das Protokoll werden die IDs gebraucht.
                const neu = (await (basisDb as unknown as Record<string, { createManyAndReturn(x: unknown): Promise<Daten[]> }>)[
                  model.charAt(0).toLowerCase() + model.slice(1)
                ].createManyAndReturn(a)) as Daten[];
                await protokolliere(model, neu.map((n) => ({ id: n.id as string, aktion: "ERSTELLT" as const, neu: n })));
                return { count: neu.length };
              }
              const ergebnis = await query(a as typeof args);
              if (Array.isArray(ergebnis)) {
                await protokolliere(model, (ergebnis as Daten[]).map((n) => ({ id: n.id as string, aktion: "ERSTELLT" as const, neu: n })));
              }
              return ergebnis;
            }

            case "update": {
              a.where = mitMandant(a.where);
              await pruefeVerknuepfungen(a.data);
              const alt = await tabelle.findUnique({ where: a.where });
              const neu = (await query(a as typeof args)) as Daten;
              await protokolliere(model, [{ id: neu.id as string, aktion: "GEAENDERT", alt, neu }]);
              return neu;
            }

            case "upsert": {
              a.where = mitMandant(a.where);
              a.create = datenMitMandant(a.create);
              await pruefeVerknuepfungen(a.create);
              await pruefeVerknuepfungen(a.update);
              const alt = await tabelle.findUnique({ where: a.where });
              const neu = (await query(a as typeof args)) as Daten;
              await protokolliere(model, [
                { id: neu.id as string, aktion: alt ? "GEAENDERT" : "ERSTELLT", alt, neu },
              ]);
              return neu;
            }

            case "delete": {
              a.where = mitMandant(a.where);
              const alt = (await query(a as typeof args)) as Daten;
              await protokolliere(model, [{ id: alt.id as string, aktion: "GELOESCHT", alt }]);
              return alt;
            }

            case "updateMany":
            case "updateManyAndReturn": {
              a.where = mitMandant(a.where);
              await pruefeVerknuepfungen(a.data);
              const alte = await tabelle.findMany({ where: a.where });
              const ergebnis = await query(a as typeof args);
              const neue = await tabelle.findMany({
                where: { id: { in: alte.map((x) => x.id) }, mandantId },
              });
              const neuNachId = new Map(neue.map((n) => [n.id, n]));
              await protokolliere(
                model,
                alte.map((x) => ({ id: x.id as string, aktion: "GEAENDERT" as const, alt: x, neu: neuNachId.get(x.id) })),
              );
              return ergebnis;
            }

            case "deleteMany": {
              a.where = mitMandant(a.where);
              const alte = await tabelle.findMany({ where: a.where });
              const ergebnis = await query(a as typeof args);
              await protokolliere(model, alte.map((x) => ({ id: x.id as string, aktion: "GELOESCHT" as const, alt: x })));
              return ergebnis;
            }

            default:
              // Unbekannte Operation lieber ablehnen als ungefiltert durchlassen.
              throw new Error(`Operation ${operation} ist im Mandantenzugriff nicht freigegeben`);
          }
        },
      },
    },
  });
}

export type MandantDb = ReturnType<typeof mandantDb>;
