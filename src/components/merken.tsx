import type { Texte } from "@/i18n";
import type { Kontext } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { merkeAufruf } from "@/lib/daten/lesezeichen";
import type { LesezeichenArt } from "@/lib/lesezeichen";
import { FavoritKnopf } from "./lesezeichen";

/**
 * Merkt den Aufruf der Detailseite („zuletzt angesehen“) und zeigt den Favoriten-Stern.
 * Erst einbinden, nachdem die Seite Rechte und Sichtbarkeit geprüft hat.
 */
export async function Merken({ kontext, t, art, pfad, titel }: { kontext: Kontext; t: Texte; art: LesezeichenArt; pfad: string; titel: string }) {
  if (!darf(kontext.rolle, "suche")) return null;
  const favorit = await merkeAufruf(kontext, { art, pfad, titel });
  return <FavoritKnopf art={art} pfad={pfad} titel={titel} istFavorit={favorit} texte={{ merken: t.lesezeichen.merken, entfernen: t.lesezeichen.entfernen }} />;
}
