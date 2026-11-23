"use server";

import { redirect } from "next/navigation";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { erlaubt } from "@/lib/daten/portfolio";
import { EingabeFehler, formularLeser, fuehreAus, type AktionsErgebnis } from "@/lib/formular";
import { alsJson, ausJson } from "@/lib/szenario";

export async function szenarioSpeichern(id: string | null, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  let ziel = id;
  const ergebnis = await fuehreAus(async () => {
    const kontext = await pruefeZugriff("szenarien", "schreiben");
    const t = texte(kontext.mandant.sprache);
    const f = formularLeser(fd, kontext.mandant.sprache);
    const name = f.pflicht("name", t.szenarien.name);
    let parameter: unknown;
    try {
      parameter = JSON.parse(String(fd.get("parameterJson") ?? ""));
    } catch {
      throw new EingabeFehler(t.fehler.unbekannt);
    }
    const gesellschaftId = f.text("gesellschaftId");
    if (gesellschaftId) {
      const sicht = await sichtbarkeit(kontext);
      const g = await kontext.db.gesellschaft.findFirst({ where: { id: erlaubt(sicht.gesellschaftIds, gesellschaftId) }, select: { id: true } });
      if (!g) throw new EingabeFehler(t.fehler.unbekannt);
    }
    const daten = {
      name,
      beschreibung: f.text("beschreibung"),
      gesellschaftId,
      parameter: alsJson(ausJson(parameter)),
    };
    if (id && fd.get("alsNeu") !== "1") {
      await kontext.db.szenario.update({ where: { id }, data: daten });
    } else {
      ziel = (await kontext.db.szenario.create({ data: { ...daten, benutzerId: kontext.benutzer.id } as never })).id;
    }
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/szenarien/${ziel}`);
}

export async function szenarioLoeschen(id: string): Promise<AktionsErgebnis> {
  const ergebnis = await fuehreAus(async () => {
    const kontext = await pruefeZugriff("szenarien", "schreiben");
    await kontext.db.szenario.delete({ where: { id } });
  });
  if (ergebnis.fehler) return ergebnis;
  redirect("/szenarien");
}
