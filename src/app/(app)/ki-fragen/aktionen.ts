"use server";

import { notFound, redirect } from "next/navigation";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { alsDbDatum } from "@/lib/datum";
import { fuehreAbfragenAus, ladeFrageGrundlage, rechneRegler, type ReglerErgebnis } from "@/lib/daten/ki-fragen";
import { EingabeFehler, formularLeser, fuehreAus, type AktionsErgebnis } from "@/lib/formular";
import { formatierer } from "@/lib/format";
import { dezimal, type Decimal } from "@/lib/geld";
import { KI_FRAGE_MAX, REGLER_ARTEN, demoAntwort, demoPlan, type ReglerArt } from "@/lib/ki-antwort";
import { KI_MODELL, KiFehler, kiModus, waehleKiAbfragen, waehleKiBausteine } from "@/lib/ki-claude";

/** Stellt eine Frage (nur auf Knopfdruck) und speichert Daten und Antwort, auch im Fehlerfall. */
export async function frageStellen(_v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  let ziel: string | null = null;
  const ergebnis = await fuehreAus(async () => {
    const kontext = await pruefeZugriff("kiAssistent", "schreiben");
    const t = texte(kontext.mandant.sprache);
    const tf = t.kiFragen;
    const f = formatierer(kontext.mandant);
    const modus = kiModus();
    if (modus === "aus") throw new EingabeFehler(t.ki.nichtKonfiguriert);
    const frage = formularLeser(fd, kontext.mandant.sprache).text("frage")?.slice(0, KI_FRAGE_MAX).trim();
    if (!frage) throw new EingabeFehler(tf.fehlerLeer);

    const grundlage = await ladeFrageGrundlage(kontext);
    if (grundlage.objekte.gesellschaften.length === 0 && grundlage.objekte.haeuser.length === 0) throw new EingabeFehler(tf.keineObjekte);
    const basis = { benutzerId: kontext.benutzer.id, frage, stichtag: alsDbDatum(grundlage.stichtag) };

    if (modus === "demo") {
      const daten = fuehreAbfragenAus(grundlage, demoPlan(frage), tf.alleObjekte);
      const antwort = demoAntwort(daten, { ...tf.pruefung, demoText: tf.demo.text, demoTitel: tf.demo.titel });
      const neu = await kontext.db.kiFrage.create({
        data: { ...basis, modell: tf.demo.modell, status: "ERFOLGREICH", daten: daten as never, antwort: antwort as never } as never,
        select: { id: true },
      });
      ziel = neu.id;
      return;
    }

    let daten = null;
    let tokensEingabe = 0;
    let tokensAusgabe = 0;
    try {
      const plan = await waehleKiAbfragen(frage, grundlage.stichtag, grundlage.objekte, t);
      tokensEingabe += plan.tokensEingabe;
      tokensAusgabe += plan.tokensAusgabe;
      daten = fuehreAbfragenAus(grundlage, plan.plan, tf.alleObjekte);
      const a = await waehleKiBausteine(frage, daten, t, f);
      tokensEingabe += a.tokensEingabe;
      tokensAusgabe += a.tokensAusgabe;
      const neu = await kontext.db.kiFrage.create({
        data: { ...basis, modell: a.modell, status: "ERFOLGREICH", daten: daten as never, antwort: a.antwort as never, tokensEingabe, tokensAusgabe } as never,
        select: { id: true },
      });
      ziel = neu.id;
    } catch (e) {
      if (!(e instanceof KiFehler)) console.error(e);
      const meldung = e instanceof KiFehler ? e.message : fuelle(t.ki.fehlerVerbindung, { status: "–" });
      const neu = await kontext.db.kiFrage.create({
        data: { ...basis, modell: KI_MODELL, status: "FEHLER", daten: (daten ?? undefined) as never, fehler: meldung, tokensEingabe, tokensAusgabe } as never,
        select: { id: true },
      });
      ziel = neu.id;
    }
  });
  if (ergebnis.fehler || !ziel) return ergebnis;
  redirect(`/ki-fragen/${ziel}`);
}

export async function frageLoeschen(id: string): Promise<AktionsErgebnis> {
  const ergebnis = await fuehreAus(async () => {
    const kontext = await pruefeZugriff("kiAssistent", "schreiben");
    const frage = await kontext.db.kiFrage.findFirst({ where: { id, benutzerId: kontext.benutzer.id }, select: { id: true } });
    if (!frage) notFound();
    await kontext.db.kiFrage.delete({ where: { id } });
  });
  if (ergebnis.fehler) return ergebnis;
  redirect("/ki-fragen");
}

const GRENZEN: Record<ReglerArt, [number, number]> = { mietsteigerung: [-10, 15], mietausfall: [0, 100], zinsVariabelPP: [-5, 10], anschlusszins: [0, 15] };

/** Was-wäre-wenn: rechnet im Code mit den Werten der Regler (heutige Daten, sichtbare Objekte). */
export async function reglerRechnen(objekt: string, werte: Partial<Record<ReglerArt, string | null>>): Promise<{ ergebnis: ReglerErgebnis | null }> {
  const kontext = await pruefeZugriff("kiAssistent");
  const zahlen: Partial<Record<ReglerArt, Decimal>> = {};
  for (const art of REGLER_ARTEN) {
    const roh = werte[art];
    if (roh == null || roh === "" || !/^-?\d+(\.\d+)?$/.test(roh)) continue;
    const [min, max] = GRENZEN[art];
    const d = dezimal(roh);
    if (d.lessThan(min) || d.greaterThan(max)) continue;
    zahlen[art] = d;
  }
  return { ergebnis: await rechneRegler(kontext, String(objekt).slice(0, 10).toUpperCase(), zahlen) };
}
