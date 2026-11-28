import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { fuelle, type Texte } from "@/i18n";
import { ERGEBNIS_SCHEMA, datenpaketAlsText, pruefeErgebnis, type Datenpaket, type GeprueftesErgebnis } from "./ki-analyse";
import { ANTWORT_SCHEMA, PLAN_SCHEMA, ergebnisseAlsText, katalogAlsText, pruefeAntwort, pruefePlan, type FrageDaten, type GepruefteAntwort, type Objekte, type PlanEintrag } from "./ki-antwort";
import type { Formatierer } from "./format";
import { ANGEBOT_KI_SCHEMA } from "@/lib/bankangebot";
import { EINGANG_KI_SCHEMA, type KiErkennung } from "./eingang";
import type { IsoDatum } from "./datum";
import { VORSCHLAG_SCHEMA, pruefeVorschlag, vorschlagPaketAlsText, type GepruefterVorschlag, type VorschlagPaket } from "./ki-vorschlag";

/** Modell für die Analyse; über KI_MODELL änderbar. */
export const KI_MODELL = process.env.KI_MODELL || "claude-opus-5-5";

/**
 * "claude": API-Schlüssel hinterlegt. "demo": kein Schlüssel, aber Entwicklung (Beispielantwort
 * ohne KI). "aus": kein Schlüssel in Produktion, Analyse nicht möglich.
 */
export function kiModus(): "claude" | "demo" | "aus" {
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  return process.env.NODE_ENV === "production" ? "aus" : "demo";
}

/**
 * Anweisungen an das Modell. Bewusst unveränderlich (kein Datum, keine Mandantendaten),
 * damit sie zwischengespeichert werden können; alle Daten stehen in der Nachricht.
 */
const ANWEISUNG = `Du bist Analyst für ein deutsches Immobilien-Asset-Management. Du analysierst eine Gesellschaft ausschließlich anhand des Datenpakets in der Nachricht. Schreibe auf Deutsch, sachlich und knapp.

Regeln:
1. Verwende nur das Datenpaket. Kein Allgemeinwissen über Marktmieten, Zinsen, Kaufpreisfaktoren oder die Objekte. Wenn eine Aussage etwas voraussetzt, das nicht im Datenpaket steht, ist sie eine ANNAHME und muss im Text so beginnen: „Annahme: …“.
2. Jede Aussage nennt in "quellen" die Nummern der Fakten (F…) und Lücken (L…), auf die sie sich stützt. Erfinde keine Nummern. Befunde, Einschätzungen und Empfehlungen brauchen mindestens einen Fakt (F…).
3. Arten: BEFUND = steht so in den Daten (Zahlen exakt wie im Datenpaket übernehmen, mit Stichtag). EINSCHAETZUNG = deine Bewertung auf Grundlage der genannten Fakten. ANNAHME = folgt nicht aus den Daten. EMPFEHLUNG = konkreter nächster Schritt.
4. Fehlende Werte sind unbekannt, nicht 0. Schätze sie nicht und rechne nicht mit ihnen. Weise stattdessen auf die Lücke (L…) hin.
5. Werte mit unterschiedlichem Stichtag nicht stillschweigend mischen; nenne den Stichtag, wenn er wichtig ist. Entwürfe und hochgerechnete Werte als solche bezeichnen.
6. Rechne nur einfache, nachvollziehbare Schritte (z. B. Differenz zweier Fakten) und nenne beide Fakten als Quelle.
7. Abkürzungen beim ersten Vorkommen erklären (z. B. „LTV (Restschuld ÷ Verkehrswert)“).
8. Struktur: eine Zusammenfassung in drei bis fünf Sätzen, dann 6 bis 20 Aussagen nach Themen, dann die für die Beurteilung wichtigsten Datenlücken mit ihrer Nummer (L…) und warum sie wichtig sind.`;

export interface AnalyseAntwort {
  ergebnis: GeprueftesErgebnis;
  modell: string;
  tokensEingabe: number;
  tokensAusgabe: number;
}

/** Fehler mit einer Meldung für die Oberfläche. */
export class KiFehler extends Error {}

/** Eine Anfrage mit strukturierter Ausgabe; liefert das geparste JSON und den Verbrauch. */
async function frageClaude(anweisung: string, nachricht: string, schema: object, t: Texte, effort: "low" | "medium" | "high" = "high"): Promise<{ json: unknown; modell: string; tokensEingabe: number; tokensAusgabe: number }> {
  const tk = t.ki;
  const client = new Anthropic();
  let antwort: Anthropic.Beta.Messages.BetaMessage;
  try {
    const stream = client.beta.messages.stream({
      model: KI_MODELL,
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort, format: { type: "json_schema", schema: schema as Record<string, unknown> } },
      system: [{ type: "text", text: anweisung, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: nachricht }],
    });
    antwort = await stream.finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.APIError) throw new KiFehler(fuelle(tk.fehlerVerbindung, { status: e.status ?? "–" }));
    throw e;
  }

  if (antwort.stop_reason === "refusal") throw new KiFehler(tk.fehlerAbgelehnt);
  if (antwort.stop_reason === "max_tokens") throw new KiFehler(tk.fehlerAbgeschnitten);
  const text = antwort.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new KiFehler(tk.fehlerFormat);
  }
  const u = antwort.usage;
  return { json, modell: antwort.model, tokensEingabe: u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), tokensAusgabe: u.output_tokens };
}

/** Prüft die Antwort; Formatfehler werden zur Meldung für die Oberfläche. */
function geprueft<T>(pruefe: () => T, t: Texte): T {
  try {
    return pruefe();
  } catch {
    throw new KiFehler(t.ki.fehlerFormat);
  }
}

export async function fuehreKiAnalyseDurch(paket: Datenpaket, schwerpunkt: string | null, t: Texte): Promise<AnalyseAntwort> {
  const tk = t.ki;
  const nachricht = [
    datenpaketAlsText(paket, t),
    "",
    schwerpunkt ? fuelle(tk.paket.schwerpunkt, { schwerpunkt }) : tk.paket.ohneSchwerpunkt,
  ].join("\n");
  const { json, ...rest } = await frageClaude(ANWEISUNG, nachricht, ERGEBNIS_SCHEMA, t);
  return { ergebnis: geprueft(() => pruefeErgebnis(json, paket), t), ...rest };
}

/**
 * Anweisungen für Vorschläge zu Szenario- und Exit-Annahmen eines Hauses. Unveränderlich
 * (zwischenspeicherbar); Datum, Haus und Daten stehen in der Nachricht.
 */
const ANWEISUNG_VORSCHLAG = `Du bist Analyst für ein deutsches Immobilien-Asset-Management. Du schlägst Annahmen für eine Exit-Kalkulation (Verkauf eines Hauses) und ein Mehrjahres-Szenario vor, ausschließlich abgeleitet aus der Historie im Datenpaket der Nachricht. Du rechnest keine Ergebnisse aus; die Software rechnet mit deinen Annahmen. Schreibe auf Deutsch, sachlich und knapp.

Parameter (genau einmal je Parameter antworten; "wert" als Text im angegebenen Format, ohne Einheit):
- verkaufsdatum: Verkaufszeitpunkt, JJJJ-MM-TT, nach dem Stichtag und höchstens zehn Jahre danach. Ein Zeitpunkt nach dem Ende einer Zinsbindung vermeidet eine Vorfälligkeitsentschädigung.
- preisBasis: Grundlage des Verkaufspreises: "gutachten" (Verkehrswert des jüngsten Gutachtens), "marktwert" (jüngster Wert ohne Gutachten) oder "miete" (Soll-Jahresnettokaltmiete × faktor). Nur eine Basis wählen, für die das Datenpaket einen Wert enthält.
- faktor: Kaufpreisfaktor (Vielfaches der Jahresnettokaltmiete), Dezimalzahl mit Punkt, 1 bis 60. Nur sinnvoll bei preisBasis "miete"; leer lassen bedeutet: Rohertragsfaktor des jüngsten Gutachtens.
- maklerProzent, sonstigeProzent: Verkaufskosten in Prozent des Preises, 0 bis 10.
- vfeProzent: Vorfälligkeitsentschädigung in Prozent der abgelösten Restschuld, 0 bis 20.
- mietsteigerung: Mietsteigerung in Prozent pro Jahr, -10 bis 15.
- mietausfall: zusätzlicher Mietausfall in Prozent der Soll-Miete, 0 bis 100. Die heutige Ist-Quote (Ist ÷ Soll) wird bereits angewandt; nur einen darüber hinausgehenden Ausfall angeben.
- leerVermietenMonate: Monate, nach denen leere Einheiten zur erwarteten Miete vermietet werden, ganze Zahl 0 bis 120.
- wertentwicklung: Wertentwicklung des Verkehrswerts in Prozent pro Jahr, -15 bis 15.
- zinsVariabelPP: Änderung der variablen Referenzzinsen in Prozentpunkten, -5 bis 10.
- anschlusszins: Zinssatz für Festzinskredite nach Ende der Zinsbindung in Prozent p. a., 0 bis 15.

Regeln:
1. Verwende nur das Datenpaket. Kein Allgemeinwissen über Marktmieten, Zinsprognosen, Kaufpreisfaktoren, Maklergebühren oder Notarkosten.
2. Jeder Wert braucht in "quellen" mindestens einen Fakt (F…), aus dem er folgt; erfinde keine Nummern. Ein Wert ohne Fakt wird verworfen.
3. Gibt das Datenpaket für einen Parameter nichts her, setze "wert" auf "" (leerer Text), nenne in "begruendung" die fehlende Angabe und in "quellen" die passende Lücke (L…). Schätze nicht.
4. Fehlende Werte sind unbekannt, nicht 0. Werte mit unterschiedlichen Stichtagen nicht stillschweigend vermischen; nenne Zeitraum oder Stichtag in der Begründung.
5. Die Begründung (ein bis drei Sätze) erklärt nachvollziehbar, wie der Wert aus den genannten Fakten folgt, z. B. „Die Neuvermietungsmiete stieg 2019–2025 um 2,1 % pro Jahr (F12); vorsichtig angesetzt.“ Rechne nur einfache Schritte und nenne die Fakten.
6. Abkürzungen beim ersten Vorkommen erklären.
7. "zusammenfassung": zwei bis vier Sätze zur Gesamtlogik der Annahmen. "datenluecken": die Lücken (L…), die die Annahmen am stärksten einschränken, mit Grund.`;

export interface VorschlagAntwort {
  ergebnis: GepruefterVorschlag;
  modell: string;
  tokensEingabe: number;
  tokensAusgabe: number;
}

export async function fuehreKiVorschlagDurch(paket: VorschlagPaket, t: Texte): Promise<VorschlagAntwort> {
  const { json, ...rest } = await frageClaude(ANWEISUNG_VORSCHLAG, vorschlagPaketAlsText(paket, t), VORSCHLAG_SCHEMA, t);
  return { ergebnis: geprueft(() => pruefeVorschlag(json, paket), t), ...rest };
}

// ---------------------------------------------------------------------------
// Prüfung der Auswahl vor dem Excel-Export
// ---------------------------------------------------------------------------

const ANWEISUNG_EXPORT = `Du prüfst die Auswahl für einen Excel-Export aus einer deutschen Immobilien-Asset-Management-Software. Du siehst nur Seitentitel, Blattnamen und Spaltennamen (gewählt und weggelassen), keine Zahlen.

Gib höchstens 6 kurze Hinweise auf Deutsch, je ein Satz, nur wenn sie dem Leser der Datei wirklich helfen:
- fehlender Zusammenhang (z. B. Monatswert ohne Jahreswert, Betrag ohne Bezeichnung, Haus oder Gesellschaft, Kennzahl ohne ihre Grundlage),
- Spalten, die ohne andere missverständlich sind (z. B. Restschuld ohne Stichtag, Quote ohne Bezugsgröße),
- unerklärte Abkürzungen (LTV, DSCR, ICR, JNKM …), wenn kein Glossar-Blatt gewählt ist,
- überflüssige Doppelungen.
Regeln: Erfinde keine Spalten, die es nicht gibt. Bewerte keine Zahlen. Schreibe nichts, wenn die Auswahl stimmig ist (dann eine leere Liste). "schwere" ist "warnung" nur, wenn die Datei sonst falsch verstanden werden kann, sonst "hinweis".`;

const EXPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["hinweise"],
  properties: {
    hinweise: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "schwere"],
        properties: { text: { type: "string" }, schwere: { type: "string", enum: ["hinweis", "warnung"] } },
      },
    },
  },
};

export async function fuehreExportPruefungDurch(beschreibung: unknown, t: Texte): Promise<{ hinweise: Array<{ text: string; art: "hinweis" | "warnung" }>; modell: string }> {
  const { json, modell } = await frageClaude(ANWEISUNG_EXPORT, JSON.stringify(beschreibung, null, 2), EXPORT_SCHEMA, t);
  const hinweise = geprueft(() => {
    const roh = (json as { hinweise: Array<{ text: unknown; schwere: unknown }> }).hinweise;
    if (!Array.isArray(roh)) throw new Error("Format");
    return roh
      .filter((h) => typeof h.text === "string" && h.text.trim())
      .slice(0, 6)
      .map((h) => ({ text: String(h.text).trim().slice(0, 400), art: h.schwere === "warnung" ? ("warnung" as const) : ("hinweis" as const) }));
  }, t);
  return { hinweise, modell };
}

// ---------------------------------------------------------------------------
// Generative Antworten: Schritt 1 wählt Datenabfragen, Schritt 2 Bausteine
// ---------------------------------------------------------------------------

const ANWEISUNG_PLAN = `Du bist der Assistent einer deutschen Immobilien-Asset-Management-Software. Zu einer Frage wählst du, welche Datenabfragen die Software ausführen soll. Du siehst den Katalog der Abfragen und die sichtbaren Objekte mit Kürzeln (G01 = Gesellschaft, H01 = Haus).

Regeln:
1. Wähle 1 bis 6 Abfragen, die die Frage beantworten. "objekt" ist ALLE oder ein Kürzel aus der Liste, passend zu den erlaubten Objekten der Abfrage.
2. Für Vergleiche (höchster, niedrigster, Rangfolge) eine Tabellen-Abfrage (GESELLSCHAFTEN, HAEUSER, KREDITE) wählen, für Entwicklungen über die Zeit VERLAUF, für Summen eines Objekts KENNZAHLEN.
3. Nenne nur Kürzel, die in der Liste stehen. Erfinde keine Objekte.
4. Passt keine Abfrage, wähle KENNZAHLEN mit ALLE.`;

const ANWEISUNG_ANTWORT = `Du bist der Assistent einer deutschen Immobilien-Asset-Management-Software. Du beantwortest eine Frage, indem du Bausteine auswählst, die die Software mit ihren eigenen, berechneten Daten füllt. Du siehst die Ergebnisse der Datenabfragen A1, A2 … mit Feldnamen und Werten.

Bausteine ("typ"), alle anderen Felder leer (null bzw. leere Liste), wenn sie nicht gebraucht werden:
- TEXT: kurzer Antworttext auf Deutsch in "text" (zwei bis fünf Sätze). Zahlen NIE selbst schreiben, sondern nur als Platzhalter: {A1.feld} für einen Wert einer KENNZAHLEN-Abfrage, {A2.G03.feld} für einen Wert einer Zeile einer Tabellen-Abfrage (Kürzel der Zeile). Objekte mit Kürzel und Namen nennen, z. B. „G03 Lindenhof“. Jahreszahlen sind erlaubt.
- KACHELN: Kennzahl-Kacheln aus einer Abfrage vom Typ "werte"; "abfrage" und "felder" (höchstens 8).
- KREIS: Leerstand nach Nutzungsart (Wohnen, Gewerbe, Stellplätze) aus einer Abfrage vom Typ "werte"; nur "abfrage".
- TABELLE: aus einer Abfrage vom Typ "tabelle"; "felder" (Spalten), optional "sortierFeld" mit "absteigend" und "zeilen" (alle, top5, top10).
- SAEULEN: waagerechte Balken je Zeile einer Abfrage vom Typ "tabelle"; genau ein Feld in "felder", dazu "absteigend" und "zeilen".
- LINIE: Liniendiagramm aus einer Abfrage vom Typ "reihe"; "felder" mit gleicher Einheit (z. B. verkehrswert und restschuld).
- REGLER: Was-wäre-wenn-Regler für ein Objekt ("objekt": ALLE oder Kürzel); "regler" aus mietsteigerung, mietausfall, zinsVariabelPP, anschlusszins. Die Software rechnet; du gibst keine Werte vor.

Regeln:
1. Beginne mit einem TEXT, der die Frage direkt beantwortet, dann 1 bis 6 passende weitere Bausteine. Höchstens 10 Bausteine.
2. Jeder Baustein außer TEXT braucht einen klaren "titel" mit Einheit, z. B. „Leerstand je Gesellschaft (Prozent der Fläche)“, ohne Zahlen außer Jahreszahlen.
3. Du rechnest nicht und erfindest keine Zahlen. Werte nur über Platzhalter. Unbekannte Werte heißen „unbekannt“; nenne sie als Datenlücke, schätze nicht.
4. Werte mit unterschiedlichem Stand nicht vermischen; unvollständige Summen als unvollständig bezeichnen.
5. Abkürzungen beim ersten Vorkommen im Text erklären (JNKM = Jahresnettokaltmiete, LTV, DSCR, ICR).
6. Wenn die Daten die Frage nicht beantworten, sage das im TEXT und nenne, welche Daten fehlen.`;

export interface FrageAntwort {
  plan: PlanEintrag[];
  antwort: GepruefteAntwort;
  modell: string;
  tokensEingabe: number;
  tokensAusgabe: number;
}

/** Schritt 1: Die KI wählt Abfragen aus dem Katalog (geprüft gegen die sichtbaren Objekte). */
export async function waehleKiAbfragen(frage: string, stichtag: IsoDatum, objekte: Objekte, t: Texte) {
  const { json, ...rest } = await frageClaude(ANWEISUNG_PLAN, katalogAlsText(frage, stichtag, objekte, t), PLAN_SCHEMA, t, "low");
  return { plan: geprueft(() => pruefePlan(json, objekte), t), ...rest };
}

/** Schritt 2: Die KI wählt Bausteine zu den berechneten Ergebnissen (geprüft im Code). */
export async function waehleKiBausteine(frage: string, daten: FrageDaten, t: Texte, f: Formatierer) {
  const { json, ...rest } = await frageClaude(ANWEISUNG_ANTWORT, ergebnisseAlsText(frage, daten, t, f), ANTWORT_SCHEMA, t, "medium");
  return { antwort: geprueft(() => pruefeAntwort(json, daten, t.kiFragen.pruefung), t), ...rest };
}

// ---------------------------------------------------------------------------
// Posteingang: Dokument lesen und Zuordnung vorschlagen
// ---------------------------------------------------------------------------

const ANWEISUNG_EINGANG = `Du liest ein eingegangenes Dokument für eine deutsche Immobilien-Asset-Management-Software und schlägst vor, was es ist und wozu es gehört. Ein Mensch prüft deinen Vorschlag; übernommen wird nichts automatisch.

Felder:
- kategorie: eine der erlaubten Kategorien oder "" (leer), wenn keine passt.
- absenderArt und absenderName: wer das Dokument ausgestellt oder geschickt hat (Briefkopf, Unterschrift). "" wenn nicht erkennbar. Das Registergericht im Briefkopf einer Firma ist nicht der Absender.
- datum: Datum des Dokuments (ausgestellt am, Stand, Stichtag) als JJJJ-MM-TT, nur wenn es so im Text steht; sonst "".
- jahr: Geschäftsjahr bzw. Bezugsjahr als JJJJ bei jahresbezogenen Dokumenten (Jahresabschluss, BWA, Saldenbestätigung), sonst "".
- objekt: Kürzel (O1, O2 …) des Objekts aus der Liste, zu dem das Dokument gehört, oder "" wenn unklar. Bevorzuge eindeutige Kennungen (IBAN, Darlehensnummer) vor Adressen und Namen. Bei mehreren gleich guten Möglichkeiten: "".
- beleg: die Textstelle, auf die sich die Zuordnung stützt, WÖRTLICH aus dem Dokument kopiert (höchstens 160 Zeichen). Ohne passende Stelle: "".
- begruendung: ein Satz, warum (z. B. „Die IBAN im Kontoauszug gehört zum Kredit O7.“).

Regeln: Erfinde nichts. Rate nicht. Lieber leer lassen als unsicher zuordnen.`;

export async function fuehreEingangsErkennungDurch(
  text: string,
  dateiname: string,
  kandidaten: Array<{ art: string; name: string; ibans: string[]; kennungen: string[]; adressen: string[] }>,
  t: Texte,
): Promise<{ erkennung: KiErkennung; modell: string }> {
  const liste = kandidaten.map((k, i) => {
    const kennungen = [...k.ibans, ...k.kennungen, ...k.adressen].filter(Boolean).join("; ");
    return `- O${i + 1} (${t.eingang.objektArten[k.art as keyof typeof t.eingang.objektArten]}): ${k.name}${kennungen ? ` – ${kennungen}` : ""}`;
  });
  const nachricht = [
    `# ${t.eingang.ki.dateiname}`,
    dateiname,
    "",
    `# ${t.eingang.ki.objekte}`,
    ...liste,
    "",
    `# ${t.eingang.ki.text}`,
    text.slice(0, 15000),
  ].join("\n");
  const { json, modell } = await frageClaude(ANWEISUNG_EINGANG, nachricht, EINGANG_KI_SCHEMA, t, "low");
  const e = geprueft(() => {
    const r = json as Record<string, unknown>;
    const s = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : "");
    return { kategorie: s("kategorie"), absenderArt: s("absenderArt"), absenderName: s("absenderName"), datum: s("datum"), jahr: s("jahr"), objekt: s("objekt"), beleg: s("beleg"), begruendung: s("begruendung") };
  }, t);
  return { erkennung: e, modell };
}

const ANWEISUNG_ANGEBOT = `Du liest das Finanzierungsangebot (Term Sheet) einer Bank für eine deutsche Immobilien-Asset-Management-Software und gibst die Konditionen als Textstellen zurück. Ein Mensch prüft alles; gerechnet wird nur in der Software.

Gib je gefundenem Feld einen Eintrag {feld, wert, beleg} zurück:
- wert: so wie im Dokument, Zahlen mit Punkt als Dezimaltrennzeichen und ohne Tausenderpunkte (z. B. "3.85", "2500000"); Datum als JJJJ-MM-TT; zinsArt "FEST" oder "VARIABEL"; referenzzins z. B. "3M-EURIBOR"; zinsbindungMonate und laufzeitMonate als ganze Monate (10 Jahre = "120").
- Prozentwerte als Prozentpunkte (3,85 % = "3.85"); bearbeitungsgebuehr und sonstigeKosten nur in Euro, nicht in Prozent; auszahlungProzent ist der Auszahlungskurs (100 = ohne Disagio); bereitstellungszins in Prozent je Monat.
- covenants und sicherheiten: kurze Aufzählung der Textstellen.
- beleg: die Textstelle WÖRTLICH aus dem Dokument kopiert (höchstens 200 Zeichen), in der der Wert steht.

Regeln: Erfinde nichts, rechne nichts aus, schätze nichts. Felder, die nicht im Dokument stehen, lässt du weg.`;

/** Liest Konditionen eines Term Sheets per KI aus (nur Textstellen; Prüfung im Code). */
export async function fuehreAngebotsErkennungDurch(text: string, t: Texte): Promise<{ felder: Array<{ feld: string; wert: string; beleg: string }>; modell: string }> {
  const { json, modell } = await frageClaude(ANWEISUNG_ANGEBOT, text.slice(0, 20000), ANGEBOT_KI_SCHEMA, t, "low");
  const felder = geprueft(() => {
    const r = json as { felder?: unknown };
    if (!Array.isArray(r.felder)) throw new Error("felder fehlt");
    return r.felder
      .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
      .map((x) => ({ feld: String(x.feld ?? ""), wert: String(x.wert ?? ""), beleg: String(x.beleg ?? "") }));
  }, t);
  return { felder, modell };
}
