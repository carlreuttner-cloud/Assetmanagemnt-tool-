"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { alsDbDatum } from "@/lib/datum";
import { erlaubt } from "@/lib/daten/portfolio";
import { PREIS_BASEN } from "@/lib/exit";
import { zuText } from "@/lib/geld";
import { EingabeFehler, formularLeser, fuehreAus, type AktionsErgebnis } from "@/lib/formular";

async function schreibKontext(hausId: string) {
  const kontext = await pruefeZugriff("szenarien", "schreiben");
  const sicht = await sichtbarkeit(kontext);
  const t = texte(kontext.mandant.sprache);
  const h = await kontext.db.haus.findFirst({ where: { id: erlaubt(sicht.hausIds, hausId), gesellschaftId: erlaubt(sicht.gesellschaftIds) }, select: { id: true } });
  if (!h) throw new EingabeFehler(t.exit.hausFehlt);
  return { db: kontext.db, t, sprache: kontext.mandant.sprache };
}

export async function exitSpeichern(hausId: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  let ziel = "";
  const ergebnis = await fuehreAus(async () => {
    const { db, t, sprache } = await schreibKontext(hausId);
    const te = t.exit;
    const f = formularLeser(fd, sprache);
    const basis = f.auswahl("basis", te.basis, PREIS_BASEN);
    const preis = f.betragOptional("preis", te.preis);
    if (basis === "frei" && !preis) throw new EingabeFehler(fuelle(t.fehler.pflichtfeld, { feld: te.preis }));
    const neu = await db.exitrechnung.create({
      data: {
        hausId,
        name: f.pflicht("name", te.speichernName),
        verkaufsdatum: alsDbDatum(f.datum("datum", te.verkaufsdatum)),
        preisBasis: basis,
        preis: zuText(preis),
        faktor: zuText(f.zahlOptional("faktor", te.faktor)),
        maklerProzent: zuText(f.prozentOptional("makler", te.makler) ?? 0)!,
        sonstigeProzent: zuText(f.prozentOptional("sonstige", te.sonstige) ?? 0)!,
        vfeProzent: zuText(f.prozentOptional("vfe", te.vfe)),
        notiz: f.text("notiz"),
      } as never,
    });
    ziel = `/exit?h=${hausId}&r=${neu.id}`;
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(ziel);
}

export async function exitLoeschen(hausId: string, id: string): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db, t } = await schreibKontext(hausId);
    const { count } = await db.exitrechnung.deleteMany({ where: { id, hausId } });
    if (count === 0) throw new EingabeFehler(t.exit.rechnungFehlt);
    refresh();
  });
}
