import "server-only";
import type { Texte } from "@/i18n";
import type { Kontext } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { fundFeld, ibanLesbar, type SuchArt, type Suchbegriff, type Treffer } from "@/lib/suche";
import { erlaubt } from "./portfolio";

export type SuchErgebnis = Array<{ art: SuchArt; treffer: Treffer[]; mehr: boolean }>;

const ci = (wert: string) => ({ contains: wert, mode: "insensitive" as const });

/**
 * Globale Suche über die Daten des Tools (nicht über Dokumentinhalte). Berücksichtigt Rechte
 * und Sichtbarkeit, aber bewusst nicht die Portfolio-Auswahl: gesucht wird immer im ganzen Bestand.
 */
export async function suche(kontext: Kontext, s: Suchbegriff, t: Texte, proArt = 5): Promise<SuchErgebnis> {
  const { db, rolle } = kontext;
  const sicht = await sichtbarkeit(kontext);
  const take = proArt + 1;
  const tf = t.suche.felder;
  const ergebnis: SuchErgebnis = [];
  const fuege = (art: SuchArt, liste: Treffer[]) => {
    if (liste.length > 0) ergebnis.push({ art, treffer: liste.slice(0, proArt), mehr: liste.length > proArt });
  };

  const aufgaben: Array<Promise<void>> = [];

  if (darf(rolle, "gesellschaften")) {
    aufgaben.push(
      db.gesellschaft
        .findMany({
          where: {
            id: erlaubt(sicht.gesellschaftIds),
            OR: [{ name: ci(s.text) }, { registernummer: ci(s.text) }, { steuernummer: ci(s.text) }, { rechtsform: ci(s.text) }],
          },
          orderBy: { name: "asc" },
          take,
          select: { id: true, name: true, rechtsform: true, registernummer: true, steuernummer: true, portfolio: { select: { name: true } } },
        })
        .then((liste) =>
          fuege(
            "gesellschaft",
            liste.map((g) => ({
              art: "gesellschaft",
              id: g.id,
              titel: g.name,
              unter: [g.rechtsform, g.portfolio?.name].filter(Boolean).join(" · ") || null,
              href: `/gesellschaften/${g.id}`,
              ...fundFeld(g.name, [[tf.registernummer, g.registernummer], [tf.steuernummer, g.steuernummer]], s),
            })),
          ),
        ),
    );
    aufgaben.push(
      db.kredit
        .findMany({
          where: {
            gesellschaftId: erlaubt(sicht.gesellschaftIds),
            OR: [
              { bezeichnung: ci(s.text) },
              { bank: ci(s.text) },
              { kreditnummer: ci(s.text) },
              { kreditnummer: ci(s.kompakt) },
              { iban: ci(s.kompakt) },
            ],
          },
          orderBy: { bezeichnung: "asc" },
          take,
          select: { id: true, bezeichnung: true, bank: true, kreditnummer: true, iban: true, gesellschaft: { select: { name: true } } },
        })
        .then((liste) =>
          fuege(
            "kredit",
            liste.map((k) => {
              const fund = fundFeld(k.bezeichnung, [[tf.iban, k.iban], [tf.kreditnummer, k.kreditnummer], [tf.bank, k.bank]], s);
              return {
                art: "kredit",
                id: k.id,
                titel: k.bezeichnung,
                unter: [k.bank, k.gesellschaft.name].filter(Boolean).join(" · "),
                href: `/gesellschaften/kredite/${k.id}`,
                feld: fund.feld,
                fundstelle: fund.feld === tf.iban && fund.fundstelle ? ibanLesbar(fund.fundstelle) : fund.fundstelle,
              };
            }),
          ),
        ),
    );
  }

  if (darf(rolle, "haeuser")) {
    aufgaben.push(
      db.haus
        .findMany({
          where: { id: erlaubt(sicht.hausIds), OR: [{ bezeichnung: ci(s.text) }, { strasse: ci(s.text) }, { ort: ci(s.text) }, { plz: { startsWith: s.kompakt } }] },
          orderBy: { bezeichnung: "asc" },
          take,
          select: { id: true, bezeichnung: true, strasse: true, plz: true, ort: true, gesellschaft: { select: { name: true } } },
        })
        .then((liste) =>
          fuege(
            "haus",
            liste.map((h) => ({
              art: "haus",
              id: h.id,
              titel: h.bezeichnung,
              unter: [[h.plz, h.ort].filter(Boolean).join(" "), h.gesellschaft.name].filter(Boolean).join(" · "),
              href: `/haeuser/${h.id}`,
              ...fundFeld(h.bezeichnung, [[tf.strasse, h.strasse], [tf.ort, [h.plz, h.ort].filter(Boolean).join(" ")]], s),
            })),
          ),
        ),
    );
    aufgaben.push(
      db.einheit
        .findMany({
          where: { hausId: erlaubt(sicht.hausIds), OR: [{ bezeichnung: ci(s.text) }, { lage: ci(s.text) }] },
          orderBy: [{ haus: { bezeichnung: "asc" } }, { bezeichnung: "asc" }],
          take,
          select: { id: true, bezeichnung: true, lage: true, haus: { select: { id: true, bezeichnung: true } } },
        })
        .then((liste) =>
          fuege(
            "einheit",
            liste.map((e) => ({
              art: "einheit",
              id: e.id,
              titel: `${e.bezeichnung} · ${e.haus.bezeichnung}`,
              unter: e.lage,
              href: `/haeuser/${e.haus.id}#einheit-${e.id}`,
              ...fundFeld(e.bezeichnung, [[tf.lage, e.lage]], s),
            })),
          ),
        ),
    );
  }

  if (darf(rolle, "mieter")) {
    const hausFilter = erlaubt(sicht.hausIds);
    aufgaben.push(
      db.mieter
        .findMany({
          where: {
            OR: [{ name: ci(s.text) }, { email: ci(s.text) }, { telefon: ci(s.kompakt) }],
            ...(hausFilter ? { mietverhaeltnisse: { some: { einheit: { hausId: hausFilter } } } } : {}),
          },
          orderBy: { name: "asc" },
          take,
          select: {
            id: true,
            name: true,
            email: true,
            telefon: true,
            mietverhaeltnisse: {
              where: hausFilter ? { einheit: { hausId: hausFilter } } : undefined,
              orderBy: { beginn: "desc" },
              take: 1,
              select: { einheit: { select: { bezeichnung: true, haus: { select: { bezeichnung: true } } } } },
            },
          },
        })
        .then((liste) =>
          fuege(
            "mieter",
            liste.map((m) => {
              const mv = m.mietverhaeltnisse[0];
              return {
                art: "mieter",
                id: m.id,
                titel: m.name,
                unter: mv ? `${mv.einheit.haus.bezeichnung} · ${mv.einheit.bezeichnung}` : null,
                href: `/mieter/personen/${m.id}`,
                ...fundFeld(m.name, [[tf.email, m.email], [tf.telefon, m.telefon]], s),
              };
            }),
          ),
        ),
    );
  }

  await Promise.all(aufgaben);
  const reihenfolge: SuchArt[] = ["gesellschaft", "haus", "einheit", "mieter", "kredit"];
  return ergebnis.sort((a, b) => reihenfolge.indexOf(a.art) - reihenfolge.indexOf(b.art));
}
