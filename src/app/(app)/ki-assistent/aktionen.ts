"use server";

import { notFound, redirect } from "next/navigation";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { alsDbDatum } from "@/lib/datum";
import { ladeDatenpaket } from "@/lib/daten/ki";
import { erlaubt } from "@/lib/daten/portfolio";
import { EingabeFehler, formularLeser, fuehreAus, type AktionsErgebnis } from "@/lib/formular";
import { demoErgebnis } from "@/lib/ki-analyse";
import { KI_MODELL, KiFehler, fuehreKiAnalyseDurch, kiModus } from "@/lib/ki-claude";

const SCHWERPUNKT_MAX = 300;

/** Startet eine Analyse (nur auf Knopfdruck) und speichert Datenpaket und Ergebnis, auch im Fehlerfall. */
export async function analyseStarten(_v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  let ziel: string | null = null;
  const ergebnis = await fuehreAus(async () => {
    const kontext = await pruefeZugriff("kiAssistent", "schreiben");
    const t = texte(kontext.mandant.sprache);
    const modus = kiModus();
    if (modus === "aus") throw new EingabeFehler(t.ki.nichtKonfiguriert);
    const f = formularLeser(fd, kontext.mandant.sprache);
    const gesellschaftId = f.pflicht("gesellschaftId", t.ki.gesellschaft);
    const schwerpunkt = f.text("schwerpunkt")?.slice(0, SCHWERPUNKT_MAX) ?? null;
    const paket = await ladeDatenpaket(kontext, gesellschaftId);
    if (!paket) notFound();

    const basis = {
      gesellschaftId,
      benutzerId: kontext.benutzer.id,
      stichtag: alsDbDatum(paket.stichtag),
      schwerpunkt,
      datenpaket: paket as never,
    };
    if (modus === "demo") {
      const gespeichert = await kontext.db.kiAnalyse.create({
        data: { ...basis, modell: t.ki.demo.modell, status: "ERFOLGREICH", ergebnis: demoErgebnis(paket, t) as never } as never,
        select: { id: true },
      });
      ziel = gespeichert.id;
      return;
    }
    try {
      const antwort = await fuehreKiAnalyseDurch(paket, schwerpunkt, t);
      const gespeichert = await kontext.db.kiAnalyse.create({
        data: {
          ...basis,
          modell: antwort.modell,
          status: "ERFOLGREICH",
          ergebnis: antwort.ergebnis as never,
          tokensEingabe: antwort.tokensEingabe,
          tokensAusgabe: antwort.tokensAusgabe,
        } as never,
        select: { id: true },
      });
      ziel = gespeichert.id;
    } catch (e) {
      if (!(e instanceof KiFehler)) console.error(e);
      const meldung = e instanceof KiFehler ? e.message : fuelle(t.ki.fehlerVerbindung, { status: "–" });
      const gespeichert = await kontext.db.kiAnalyse.create({
        data: { ...basis, modell: KI_MODELL, status: "FEHLER", fehler: meldung } as never,
        select: { id: true },
      });
      ziel = gespeichert.id;
    }
  });
  if (ergebnis.fehler || !ziel) return ergebnis;
  redirect(`/ki-assistent/${ziel}`);
}

export async function analyseLoeschen(id: string): Promise<AktionsErgebnis> {
  const ergebnis = await fuehreAus(async () => {
    const kontext = await pruefeZugriff("kiAssistent", "schreiben");
    const sicht = await sichtbarkeit(kontext);
    const a = await kontext.db.kiAnalyse.findFirst({ where: { id, gesellschaftId: erlaubt(sicht.gesellschaftIds) }, select: { id: true } });
    if (!a) notFound();
    await kontext.db.kiAnalyse.delete({ where: { id } });
  });
  if (ergebnis.fehler) return ergebnis;
  redirect("/ki-assistent");
}
