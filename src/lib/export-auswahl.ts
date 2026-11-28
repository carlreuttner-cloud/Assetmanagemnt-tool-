/**
 * Auswahl vor dem Excel-Export: welche Tabellen und Spalten in die Datei kommen, und
 * Prüfregeln dazu (reiner Code, ohne KI). Die KI-Prüfung bekommt nur Tabellen- und
 * Spaltennamen, nie Zellwerte.
 */

export type ExportTabelleInfo = {
  id: string;
  /** Blattname bzw. Überschrift der Tabelle */
  blatt: string;
  /** Spaltennamen nach dem Aufteilen von Monat/Jahr (Excel-Spalten) */
  spalten: string[];
};

export type ExportAuswahl = {
  kacheln: boolean;
  glossar: boolean;
  tabellen: Record<string, { an: boolean; spalten: boolean[] }>;
};

export type AuswahlHinweis = { art: "warnung" | "hinweis"; text: string; tabelle?: string };

export type AuswahlTexte = {
  leer: string;
  /** {tabelle}, {spalte}, {fehlt} */
  monatJahr: string;
  /** {tabelle}, {spalte} */
  ersteSpalte: string;
  /** {tabelle} */
  keineSpalten: string;
  /** {begriffe} */
  abkuerzungen: string;
  monat: string;
  jahr: string;
};

/** Leere Auswahl: alles an (so wie der bisherige Export). */
export function alleAn(tabellen: ExportTabelleInfo[], kacheln: boolean): ExportAuswahl {
  return {
    kacheln,
    glossar: false,
    tabellen: Object.fromEntries(tabellen.map((t) => [t.id, { an: true, spalten: t.spalten.map(() => true) }])),
  };
}

const fuelle = (text: string, werte: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, k: string) => werte[k] ?? "");

/** Abkürzungen aus dem Glossar, die in den Texten als eigenes Wort vorkommen. */
export function abkuerzungenIn(texte: string[], begriffe: string[]): string[] {
  const gefunden = new Set<string>();
  for (const b of begriffe) {
    const muster = new RegExp(`(^|[^\\p{L}])${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "u");
    if (texte.some((t) => muster.test(t))) gefunden.add(b);
  }
  return [...gefunden];
}

/**
 * Prüft die Auswahl mit festen Regeln:
 * - nichts gewählt;
 * - Monatswert ohne zugehörigen Jahreswert (oder umgekehrt), z. B. Miete Monat ohne JNKM;
 * - erste Spalte (Bezeichnung) abgewählt: Zeilen sind dann nicht zuzuordnen;
 * - Tabelle an, aber keine Spalte gewählt;
 * - Abkürzungen in gewählten Spalten, ohne Glossar-Blatt.
 */
export function pruefeAuswahl(
  tabellen: ExportTabelleInfo[],
  kachelTitel: string[],
  auswahl: ExportAuswahl,
  begriffe: string[],
  t: AuswahlTexte,
): AuswahlHinweis[] {
  const hinweise: AuswahlHinweis[] = [];
  const aktiv = tabellen.filter((x) => auswahl.tabellen[x.id]?.an && auswahl.tabellen[x.id].spalten.some(Boolean));
  if (!auswahl.kacheln && aktiv.length === 0) return [{ art: "warnung", text: t.leer }];

  const gewaehlteTexte: string[] = auswahl.kacheln ? [...kachelTitel] : [];
  for (const tab of tabellen) {
    const a = auswahl.tabellen[tab.id];
    if (!a?.an) continue;
    if (!a.spalten.some(Boolean)) {
      hinweise.push({ art: "hinweis", text: fuelle(t.keineSpalten, { tabelle: tab.blatt }), tabelle: tab.id });
      continue;
    }
    if (!a.spalten[0] && tab.spalten.length > 1) hinweise.push({ art: "hinweis", text: fuelle(t.ersteSpalte, { tabelle: tab.blatt, spalte: tab.spalten[0] }), tabelle: tab.id });
    const monat = ` – ${t.monat}`;
    const jahr = ` – ${t.jahr}`;
    tab.spalten.forEach((name, i) => {
      if (a.spalten[i]) gewaehlteTexte.push(name);
      if (!name.endsWith(monat)) return;
      const basis = name.slice(0, -monat.length);
      const j = tab.spalten.indexOf(basis + jahr);
      if (j < 0 || a.spalten[i] === a.spalten[j]) return;
      const fehlt = a.spalten[i] ? t.jahr : t.monat;
      hinweise.push({ art: "warnung", text: fuelle(t.monatJahr, { tabelle: tab.blatt, spalte: basis, fehlt }), tabelle: tab.id });
    });
  }
  if (!auswahl.glossar) {
    const abk = abkuerzungenIn(gewaehlteTexte, begriffe);
    if (abk.length) hinweise.push({ art: "hinweis", text: fuelle(t.abkuerzungen, { begriffe: abk.join(", ") }) });
  }
  return hinweise;
}

/** Beschreibung der Auswahl für die KI-Prüfung: nur Namen, keine Zellwerte. */
export function auswahlBeschreibung(seite: string, tabellen: ExportTabelleInfo[], kachelTitel: string[], auswahl: ExportAuswahl) {
  return {
    seite,
    kennzahlen: auswahl.kacheln ? kachelTitel : [],
    glossarBlatt: auswahl.glossar,
    tabellen: tabellen.map((x) => {
      const a = auswahl.tabellen[x.id];
      return {
        blatt: x.blatt,
        exportiert: !!a?.an,
        gewaehlt: x.spalten.filter((_, i) => a?.an && a.spalten[i]),
        weggelassen: x.spalten.filter((_, i) => !(a?.an && a.spalten[i])),
      };
    }),
  };
}
export type AuswahlBeschreibung = ReturnType<typeof auswahlBeschreibung>;
