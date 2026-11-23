/**
 * Einlesen von Formularfeldern in Server-Aktionen. Fehler werden als `EingabeFehler`
 * mit verständlichem Text geworfen und von `fuehreAus()` als Ergebnis zurückgegeben.
 */
import { unstable_rethrow } from "next/navigation";
import { fuelle, texte } from "@/i18n";
import { istIsoDatum } from "./datum";
import { parseBetrag, type Decimal } from "./geld";

export type AktionsErgebnis = { fehler?: string; ok?: string };

export class EingabeFehler extends Error {}

const t = texte();

export function formularLeser(fd: FormData, sprache = "de-DE") {
  const roh = (name: string) => {
    const wert = fd.get(name);
    return typeof wert === "string" ? wert.trim() : "";
  };
  const pflicht = (name: string, feld: string) => {
    const wert = roh(name);
    if (!wert) throw new EingabeFehler(fuelle(t.fehler.pflichtfeld, { feld }));
    return wert;
  };
  const dezimalFeld = (name: string, feld: string, meldung: string, optional: boolean): Decimal | null => {
    const wert = roh(name);
    if (!wert) {
      if (optional) return null;
      throw new EingabeFehler(fuelle(t.fehler.pflichtfeld, { feld }));
    }
    // Prozentwerte und Faktoren: "1.125" ist ein Dezimalpunkt, kein Tausenderpunkt.
    let text = wert.replace("%", "").trim();
    if (meldung !== t.fehler.betrag && !text.includes(",") && /^-?\d+\.\d+$/.test(text)) text = text.replace(".", ",");
    try {
      return parseBetrag(text, sprache);
    } catch {
      throw new EingabeFehler(fuelle(meldung, { feld }));
    }
  };
  return {
    text: (name: string) => roh(name) || null,
    pflicht,
    betrag: (name: string, feld: string) => dezimalFeld(name, feld, t.fehler.betrag, false)!,
    betragOptional: (name: string, feld: string) => dezimalFeld(name, feld, t.fehler.betrag, true),
    prozent: (name: string, feld: string) => dezimalFeld(name, feld, t.fehler.prozent, false)!,
    prozentOptional: (name: string, feld: string) => dezimalFeld(name, feld, t.fehler.prozent, true),
    zahlOptional: (name: string, feld: string) => dezimalFeld(name, feld, t.fehler.zahl, true),
    datum: (name: string, feld: string) => {
      const wert = pflicht(name, feld);
      if (!istIsoDatum(wert)) throw new EingabeFehler(fuelle(t.fehler.datum, { feld }));
      return wert;
    },
    datumOptional: (name: string, feld: string) => {
      const wert = roh(name);
      if (!wert) return null;
      if (!istIsoDatum(wert)) throw new EingabeFehler(fuelle(t.fehler.datum, { feld }));
      return wert;
    },
    auswahl: <T extends string>(name: string, feld: string, erlaubt: readonly T[]): T => {
      const wert = pflicht(name, feld);
      if (!erlaubt.includes(wert as T)) throw new EingabeFehler(fuelle(t.fehler.pflichtfeld, { feld }));
      return wert as T;
    },
    alle: (name: string) => fd.getAll(name).map((w) => (typeof w === "string" ? w.trim() : "")),
  };
}

/**
 * Führt eine Server-Aktion aus und wandelt Eingabefehler in ein Ergebnis für das Formular um.
 * Umleitungen (redirect, notFound) werden durchgereicht.
 */
export async function fuehreAus(arbeit: () => Promise<AktionsErgebnis | void>): Promise<AktionsErgebnis> {
  try {
    return (await arbeit()) ?? {};
  } catch (fehler) {
    unstable_rethrow(fehler);
    if (fehler instanceof EingabeFehler) return { fehler: fehler.message };
    console.error(fehler);
    return { fehler: t.fehler.unbekannt };
  }
}
