"use server";

import { notFound, redirect } from "next/navigation";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { bereichsSicht } from "@/lib/auth/auswahl";
import { darf } from "@/lib/auth/rechte";
import { alsDbDatum } from "@/lib/datum";
import { ladeVorschlagPaket } from "@/lib/daten/ki-vorschlag";
import { erlaubt } from "@/lib/daten/portfolio";
import { EingabeFehler, formularLeser, fuehreAus, type AktionsErgebnis } from "@/lib/formular";
import { KI_MODELL, KiFehler, fuehreKiVorschlagDurch, kiModus } from "@/lib/ki-claude";
import { demoVorschlag } from "@/lib/ki-vorschlag";

/**
 * Erzeugt einen Vorschlag (nur auf Knopfdruck) und speichert Datenpaket und Ergebnis, auch im
 * Fehlerfall. Braucht Schreibrecht für Szenarien und die KI.
 */
export async function vorschlagGenerieren(_v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  let ziel: string | null = null;
  const ergebnis = await fuehreAus(async () => {
    const kontext = await pruefeZugriff("szenarien", "schreiben");
    const t = texte(kontext.mandant.sprache);
    if (!darf(kontext.rolle, "kiAssistent", "schreiben")) notFound();
    const modus = kiModus();
    if (modus === "aus") throw new EingabeFehler(t.kiVorschlag.nichtKonfiguriert);
    const hausId = formularLeser(fd, kontext.mandant.sprache).pflicht("hausId", t.kiVorschlag.haus);
    const paket = await ladeVorschlagPaket(kontext, hausId);
    if (!paket) notFound();

    const basis = { hausId, benutzerId: kontext.benutzer.id, stichtag: alsDbDatum(paket.stichtag), datenpaket: paket as never };
    const speichern = async (daten: Record<string, unknown>) => {
      const x = await kontext.db.kiVorschlag.create({ data: { ...basis, ...daten } as never, select: { id: true } });
      ziel = `/ki-vorschlag?h=${hausId}&v=${x.id}`;
    };
    if (modus === "demo") {
      await speichern({ modell: t.kiVorschlag.demo.modell, status: "ERFOLGREICH", ergebnis: demoVorschlag(paket, t) });
      return;
    }
    try {
      const antwort = await fuehreKiVorschlagDurch(paket, t);
      await speichern({ modell: antwort.modell, status: "ERFOLGREICH", ergebnis: antwort.ergebnis, tokensEingabe: antwort.tokensEingabe, tokensAusgabe: antwort.tokensAusgabe });
    } catch (e) {
      if (!(e instanceof KiFehler)) console.error(e);
      await speichern({ modell: KI_MODELL, status: "FEHLER", fehler: e instanceof KiFehler ? e.message : fuelle(t.ki.fehlerVerbindung, { status: "–" }) });
    }
  });
  if (ergebnis.fehler || !ziel) return ergebnis;
  redirect(ziel);
}

export async function vorschlagLoeschen(id: string): Promise<AktionsErgebnis> {
  let hausId: string | null = null;
  const ergebnis = await fuehreAus(async () => {
    const kontext = await pruefeZugriff("szenarien", "schreiben");
    const sicht = await bereichsSicht(kontext);
    const v = await kontext.db.kiVorschlag.findFirst({ where: { id, hausId: erlaubt(sicht.hausIds) }, select: { id: true, hausId: true } });
    if (!v) notFound();
    hausId = v.hausId;
    await kontext.db.kiVorschlag.delete({ where: { id } });
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/ki-vorschlag?h=${hausId}`);
}
