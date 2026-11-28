"use server";

import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import type { AuswahlBeschreibung } from "@/lib/export-auswahl";
import { KiFehler, fuehreExportPruefungDurch, kiModus } from "@/lib/ki-claude";

export type KiPruefErgebnis =
  | { status: "ok"; hinweise: Array<{ text: string; art: "hinweis" | "warnung" }>; quelle: string }
  | { status: "fehler"; meldung: string };

/**
 * Lässt die Export-Auswahl von der KI prüfen. Übermittelt werden nur Seiten-, Blatt- und
 * Spaltennamen, keine Werte. Ohne API-Schlüssel: verständlicher Hinweis (Produktion) bzw.
 * leere Beispielprüfung (Entwicklung), die Regelprüfung im Dialog läuft immer.
 */
export async function exportAuswahlPruefen(beschreibung: AuswahlBeschreibung): Promise<KiPruefErgebnis> {
  // Nur Rollen mit KI-Recht (Knopf erscheint nur für sie); sonst Weiterleitung wie bei Seiten.
  const kontext = await pruefeZugriff("kiAssistent");
  const t = texte(kontext.mandant.sprache);
  const te = t.exportAuswahl;
  const modus = kiModus();
  if (modus === "aus") return { status: "fehler", meldung: t.ki.nichtKonfiguriert };
  if (modus === "demo") return { status: "fehler", meldung: te.kiDemo };
  // Größe begrenzen: nur Namen, höchstens 40 Tabellen mit je 60 Spalten
  const knapp = {
    ...beschreibung,
    seite: String(beschreibung.seite).slice(0, 200),
    kennzahlen: beschreibung.kennzahlen.slice(0, 40).map((x) => String(x).slice(0, 120)),
    tabellen: beschreibung.tabellen.slice(0, 40).map((x) => ({
      ...x,
      blatt: String(x.blatt).slice(0, 120),
      gewaehlt: x.gewaehlt.slice(0, 60).map((s) => String(s).slice(0, 120)),
      weggelassen: x.weggelassen.slice(0, 60).map((s) => String(s).slice(0, 120)),
    })),
  };
  try {
    const { hinweise, modell } = await fuehreExportPruefungDurch(knapp, t);
    return { status: "ok", hinweise, quelle: fuelle(te.kiQuelle, { modell }) };
  } catch (e) {
    if (!(e instanceof KiFehler)) console.error(e);
    return { status: "fehler", meldung: e instanceof KiFehler ? e.message : fuelle(t.ki.fehlerVerbindung, { status: "–" }) };
  }
}
