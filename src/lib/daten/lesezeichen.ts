import "server-only";
import type { Kontext } from "@/lib/auth/kontext";
import { ZULETZT_MAX, type LesezeichenArt, type LesezeichenEintrag } from "@/lib/lesezeichen";

const schluessel = (kontext: Kontext, pfad: string) => ({
  mandantId_benutzerId_pfad: { mandantId: kontext.mandant.id, benutzerId: kontext.benutzer.id, pfad },
});

/**
 * Merkt den Aufruf einer Detailseite für „zuletzt angesehen“ und liefert, ob sie Favorit ist.
 * Nur aus Detailseiten aufrufen, nachdem Rechte und Sichtbarkeit geprüft sind.
 */
export async function merkeAufruf(kontext: Kontext, eintrag: { pfad: string; titel: string; art: LesezeichenArt }): Promise<boolean> {
  const { db } = kontext;
  const jetzt = new Date();
  const z = await db.lesezeichen.upsert({
    where: schluessel(kontext, eintrag.pfad),
    create: { benutzerId: kontext.benutzer.id, pfad: eintrag.pfad, titel: eintrag.titel, objektArt: eintrag.art, angesehenAm: jetzt } as never,
    update: { titel: eintrag.titel, angesehenAm: jetzt },
    select: { favorit: true },
  });
  // Ältere Einträge ohne Favorit aufräumen
  const alte = await db.lesezeichen.findMany({
    where: { benutzerId: kontext.benutzer.id, favorit: false },
    orderBy: { angesehenAm: "desc" },
    skip: ZULETZT_MAX,
    select: { id: true },
  });
  if (alte.length > 0) await db.lesezeichen.deleteMany({ where: { id: { in: alte.map((a) => a.id) } } });
  return z.favorit;
}

/** Favorit setzen oder entfernen; legt den Eintrag bei Bedarf an. */
export async function setzeFavorit(kontext: Kontext, eintrag: { pfad: string; titel: string; art: LesezeichenArt }, favorit: boolean) {
  await kontext.db.lesezeichen.upsert({
    where: schluessel(kontext, eintrag.pfad),
    create: { benutzerId: kontext.benutzer.id, pfad: eintrag.pfad, titel: eintrag.titel, objektArt: eintrag.art, favorit, favoritSeit: favorit ? new Date() : null } as never,
    update: { favorit, favoritSeit: favorit ? new Date() : null },
  });
}

/** Favoriten (alphabetisch) und die zuletzt angesehenen Seiten des Benutzers. */
export async function ladeLesezeichen(kontext: Kontext, anzahlZuletzt = 6): Promise<{ favoriten: LesezeichenEintrag[]; zuletzt: LesezeichenEintrag[] }> {
  const [fav, zul] = await Promise.all([
    kontext.db.lesezeichen.findMany({ where: { benutzerId: kontext.benutzer.id, favorit: true }, orderBy: { titel: "asc" }, take: 30 }),
    kontext.db.lesezeichen.findMany({ where: { benutzerId: kontext.benutzer.id, angesehenAm: { not: null } }, orderBy: { angesehenAm: "desc" }, take: anzahlZuletzt }),
  ]);
  const alsEintrag = (l: { pfad: string; titel: string; objektArt: string }) => ({ pfad: l.pfad, titel: l.titel, art: l.objektArt as LesezeichenArt });
  return { favoriten: fav.map(alsEintrag), zuletzt: zul.map(alsEintrag) };
}
