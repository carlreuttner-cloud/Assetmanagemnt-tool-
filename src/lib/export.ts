/**
 * Export der Ansichten nach Excel: Umwandlung angezeigter Texte (deutsches Format) in
 * Zellwerte. Beträge bleiben hier Dezimal-Text; erst die Excel-Zelle wird zur Zahl.
 */

export type Zellwert =
  | { typ: "zahl"; dezimal: string; format: string }
  | { typ: "datum"; iso: string }
  | { typ: "text"; text: string };

const ZAHL = String.raw`-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?`;
const MUSTER = {
  euro: new RegExp(`^(${ZAHL}) ?€$`),
  prozent: new RegExp(`^(${ZAHL}) ?%$`),
  flaeche: new RegExp(`^(${ZAHL}) ?m²$`),
  zahl: new RegExp(`^(${ZAHL})$`),
  datum: /^(\d{2})\.(\d{2})\.(\d{4})$/,
};

/** "1.234,56" → "1234.56" */
export function deutscheZahl(text: string): string {
  return text.replace(/\./g, "").replace(",", ".");
}

const stellenFormat = (stellen: number) => (stellen > 0 ? `0.${"0".repeat(stellen)}` : "0");

/** Wandelt einen angezeigten Zellentext in einen typisierten Wert um; alles Unklare bleibt Text. */
export function zellwert(roh: string): Zellwert {
  const text = roh.replace(/ /g, " ").replace(/\s+/g, " ").trim();
  let m = MUSTER.euro.exec(text);
  if (m) return { typ: "zahl", dezimal: deutscheZahl(m[1]), format: `#,##${stellenFormat((m[2] ?? "").length)} "€"` };
  m = MUSTER.prozent.exec(text);
  if (m) {
    const stellen = (m[2] ?? "").length;
    // Excel-Prozent: Wert / 100; Dezimalverschiebung als Text, ohne Gleitkomma
    return { typ: "zahl", dezimal: prozentAlsAnteil(deutscheZahl(m[1])), format: `${stellenFormat(stellen)}%` };
  }
  m = MUSTER.flaeche.exec(text);
  if (m) return { typ: "zahl", dezimal: deutscheZahl(m[1]), format: `#,##${stellenFormat((m[2] ?? "").length)} "m²"` };
  m = MUSTER.zahl.exec(text);
  if (m) return { typ: "zahl", dezimal: deutscheZahl(m[1]), format: `#,##${stellenFormat((m[2] ?? "").length)}` };
  m = MUSTER.datum.exec(text);
  if (m) return { typ: "datum", iso: `${m[3]}-${m[2]}-${m[1]}` };
  return { typ: "text", text: roh.trim() };
}

/** "4.7" → "0.047" (Komma um zwei Stellen nach links, exakt als Text) */
export function prozentAlsAnteil(dezimal: string): string {
  const negativ = dezimal.startsWith("-");
  const [ganz, bruch = ""] = (negativ ? dezimal.slice(1) : dezimal).split(".");
  const ziffern = ganz.padStart(3, "0") + bruch;
  const komma = ziffern.length - bruch.length - 2;
  const ergebnis = `${ziffern.slice(0, komma).replace(/^0+(?=\d)/, "")}.${ziffern.slice(komma)}`.replace(/\.?0+$/, "") || "0";
  return negativ && ergebnis !== "0" ? `-${ergebnis}` : ergebnis;
}

/** Gültiger, eindeutiger Blattname für Excel (max. 31 Zeichen, ohne []:*?/\). */
export function blattName(wunsch: string, vergeben: Set<string>): string {
  const basis = (wunsch.replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim() || "Tabelle").slice(0, 31);
  let name = basis;
  for (let i = 2; vergeben.has(name.toLowerCase()); i++) name = `${basis.slice(0, 31 - String(i).length - 1)} ${i}`;
  vergeben.add(name.toLowerCase());
  return name;
}

/** Dateiname aus Seitentitel und Datum, ohne Sonderzeichen. */
export function dateiName(titel: string, datum: string, endung: string): string {
  const sauber = titel
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${sauber || "Export"}_${datum}.${endung}`;
}
