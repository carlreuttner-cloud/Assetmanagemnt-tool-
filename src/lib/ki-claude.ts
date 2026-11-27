import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { fuelle, type Texte } from "@/i18n";
import { ERGEBNIS_SCHEMA, datenpaketAlsText, pruefeErgebnis, type Datenpaket, type GeprueftesErgebnis } from "./ki-analyse";

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

export async function fuehreKiAnalyseDurch(paket: Datenpaket, schwerpunkt: string | null, t: Texte): Promise<AnalyseAntwort> {
  const tk = t.ki;
  const client = new Anthropic();
  const nachricht = [
    datenpaketAlsText(paket, t),
    "",
    schwerpunkt ? fuelle(tk.paket.schwerpunkt, { schwerpunkt }) : tk.paket.ohneSchwerpunkt,
  ].join("\n");

  let antwort: Anthropic.Beta.Messages.BetaMessage;
  try {
    const stream = client.beta.messages.stream({
      model: KI_MODELL,
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: { type: "json_schema", schema: ERGEBNIS_SCHEMA as unknown as Record<string, unknown> } },
      system: [{ type: "text", text: ANWEISUNG, cache_control: { type: "ephemeral" } }],
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
  let ergebnis: GeprueftesErgebnis;
  try {
    ergebnis = pruefeErgebnis(JSON.parse(text), paket);
  } catch {
    throw new KiFehler(tk.fehlerFormat);
  }
  return { ergebnis, modell: antwort.model, tokensEingabe: antwort.usage.input_tokens + (antwort.usage.cache_read_input_tokens ?? 0) + (antwort.usage.cache_creation_input_tokens ?? 0), tokensAusgabe: antwort.usage.output_tokens };
}
