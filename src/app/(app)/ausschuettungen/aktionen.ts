"use server";

import { refresh } from "next/cache";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { alsDbDatum } from "@/lib/datum";
import { erlaubt } from "@/lib/daten/portfolio";
import { zuText } from "@/lib/geld";
import { EingabeFehler, formularLeser, fuehreAus, type AktionsErgebnis } from "@/lib/formular";

/** Legt eine geplante Ausschüttung als Planposition an (nur sichtbare Gesellschaften). */
export async function ausschuettungPlanen(_v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const kontext = await pruefeZugriff("gesellschaften", "schreiben");
    const sicht = await sichtbarkeit(kontext);
    const t = texte(kontext.mandant.sprache);
    const ta = t.ausschuettung;
    const f = formularLeser(fd, kontext.mandant.sprache);
    const g = await kontext.db.gesellschaft.findFirst({ where: { id: erlaubt(sicht.gesellschaftIds, f.pflicht("gesellschaftId", ta.gesellschaft)) }, select: { id: true } });
    if (!g) throw new EingabeFehler(ta.gesellschaftFehlt);
    const betrag = f.betrag("betrag", ta.betrag);
    if (betrag.lessThanOrEqualTo(0)) throw new EingabeFehler(fuelle(t.fehler.betrag, { feld: ta.betrag }));
    const monat = f.datum("monat", ta.monat);
    await kontext.db.planposition.create({
      data: {
        gesellschaftId: g.id,
        art: "AUSSCHUETTUNG",
        monat: alsDbDatum(`${monat.slice(0, 7)}-01`),
        betrag: zuText(betrag),
        bezeichnung: f.text("bezeichnung") ?? ta.bezeichnungVorgabe,
        quelle: f.text("quelle"),
      } as never,
    });
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}
