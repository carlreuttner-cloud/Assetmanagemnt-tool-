import "server-only";
import { isoDatum } from "@/lib/datum";
import { dezimal } from "@/lib/geld";
import type { BuchungsArt } from "@/lib/kredit";
import type { SondertilgungEingabe } from "@/lib/sondertilgung";

/** Felder, die `sondertilgungAusDb` braucht (für `select`). */
export const SONDERTILGUNG_FELDER = {
  ursprungsbetrag: true,
  auszahlungsdatum: true,
  zinsbindungBis: true,
  laufzeitBis: true,
  sondertilgungRecht: true,
  sondertilgungWert: true,
  sondertilgungJahr: true,
  sondertilgungUebertragbar: true,
  sondertilgungBis: true,
  buchungen: { where: { art: "SONDERTILGUNG" }, select: { datum: true, art: true, betrag: true } },
} as const;

type Dez = { toFixed(): string };
type Zeile = {
  ursprungsbetrag: Dez;
  auszahlungsdatum: Date | null;
  zinsbindungBis: Date | null;
  laufzeitBis: Date | null;
  sondertilgungRecht: SondertilgungEingabe["recht"];
  sondertilgungWert: Dez | null;
  sondertilgungJahr: SondertilgungEingabe["jahr"];
  sondertilgungUebertragbar: boolean;
  sondertilgungBis: Date | null;
  buchungen: Array<{ datum: Date; art: string; betrag: Dez }>;
};

export function sondertilgungAusDb(k: Zeile): SondertilgungEingabe {
  return {
    recht: k.sondertilgungRecht,
    wert: k.sondertilgungWert === null ? null : dezimal(k.sondertilgungWert),
    jahr: k.sondertilgungJahr,
    uebertragbar: k.sondertilgungUebertragbar,
    bis: isoDatum(k.sondertilgungBis),
    ursprungsbetrag: dezimal(k.ursprungsbetrag),
    auszahlungsdatum: isoDatum(k.auszahlungsdatum),
    zinsbindungBis: isoDatum(k.zinsbindungBis),
    laufzeitBis: isoDatum(k.laufzeitBis),
    buchungen: k.buchungen.map((b) => ({ datum: isoDatum(b.datum)!, art: b.art as BuchungsArt, betrag: dezimal(b.betrag) })),
  };
}
