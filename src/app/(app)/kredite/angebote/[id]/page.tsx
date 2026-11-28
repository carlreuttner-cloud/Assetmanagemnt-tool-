import Link from "next/link";
import { notFound } from "next/navigation";
import { Formular } from "@/components/formular";
import { Auswahl, Feld, Felder, Karte, Marke, Seitenkopf, Textfeld, knopfKlasse } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import type { AngebotFeld, AngebotVorschlag } from "@/lib/bankangebot";
import { isoDatum } from "@/lib/datum";
import { angebotFilter } from "@/lib/daten/bankangebote";
import { erlaubt } from "@/lib/daten/portfolio";
import { formatierer } from "@/lib/format";
import { angebotLoeschen, angebotSpeichern } from "../aktionen";

export default async function AngebotSeite({ params }: PageProps<"/kredite/angebote/[id]">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("gesellschaften", "schreiben");
  const sicht = await sichtbarkeit(kontext);
  const t = texte(kontext.mandant.sprache);
  const tb = t.bankangebote;
  const tf = tb.felder;
  const f = formatierer(kontext.mandant);
  const a = await kontext.db.bankangebot.findFirst({ where: { id, ...angebotFilter(sicht) }, include: { dokument: { select: { id: true, titel: true } } } });
  if (!a) notFound();
  const [gesellschaften, kredite, bestaetiger] = await Promise.all([
    kontext.db.gesellschaft.findMany({ where: { id: erlaubt(sicht.gesellschaftIds) }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    kontext.db.kredit.findMany({ where: { gesellschaftId: erlaubt(sicht.gesellschaftIds) }, orderBy: { bezeichnung: "asc" }, select: { id: true, bezeichnung: true, bank: true } }),
    a.bestaetigtVonId ? kontext.db.mitgliedschaft.findFirst({ where: { benutzerId: a.bestaetigtVonId }, select: { benutzer: { select: { name: true } } } }) : null,
  ]);
  const v = (a.vorschlag ?? {}) as AngebotVorschlag;
  const hinweis = (feld: AngebotFeld, standard?: string) => {
    const g = v[feld];
    if (!g) return standard;
    return (
      <span data-beleg={feld}>
        {fuelle(tb.belegHinweis, { herkunft: tb.herkunft[g.herkunft], beleg: g.beleg })}
        {g.hinweis && <span className="block text-amber-700">{fuelle(tb.kiHinweis, { hinweis: g.hinweis })}</span>}
      </span>
    );
  };
  const zahl = (w: unknown, stellen?: number) => (w == null ? null : f.eingabe(String(w), stellen));
  const datum = (d: Date | null) => (d ? isoDatum(d) : null);

  return (
    <div className="max-w-5xl space-y-6">
      <Seitenkopf
        titel={
          <>
            {a.bank} <Marke ton={a.status === "BESTAETIGT" ? "gut" : "warnung"}>{tb.stati[a.status]}</Marke>
          </>
        }
        beschreibung={a.bezeichnung ?? undefined}
        zurueck={{ href: "/kredite/angebote", text: tb.zurueck }}
      />
      <Karte>
        <p className="text-sm text-slate-700">
          {a.status === "BESTAETIGT" ? fuelle(tb.bestaetigtHinweis, { datum: a.bestaetigtAm ? f.datum(a.bestaetigtAm) : "–", name: bestaetiger?.benutzer.name ?? "–" }) : tb.entwurfHinweis}
        </p>
        {a.dokument && (
          <p className="mt-2 text-sm">
            {tb.termSheet}:{" "}
            <Link href={`/import/dokumente/${a.dokument.id}`} className="font-medium text-sky-700 hover:underline">
              {a.dokument.titel}
            </Link>
          </p>
        )}
        {a.vorschlag && <p className="mt-1 text-xs text-slate-500">{a.kiModell ? fuelle(tb.kiMitgewirkt, { modell: a.kiModell }) : tb.nurRegeln}</p>}
      </Karte>

      <Karte titel={tb.bearbeitenTitel}>
        <Formular aktion={angebotSpeichern.bind(null, a.id)} absenden={tb.speichern} art="sekundaer">
          <Felder>
            <Feld name="bank" label={tf.bank} wert={a.bank} pflicht hinweis={hinweis("bank")} />
            <Feld name="bezeichnung" label={tf.bezeichnung} wert={a.bezeichnung} />
            <Auswahl name="gesellschaftId" label={tf.gesellschaft} wert={a.gesellschaftId} leerText={tb.keineAngabe} optionen={gesellschaften.map((g) => ({ wert: g.id, text: g.name }))} />
            <Auswahl name="kreditId" label={tf.kredit} wert={a.kreditId} leerText={tb.keineAngabe} optionen={kredite.map((k) => ({ wert: k.id, text: `${k.bezeichnung}${k.bank ? ` (${k.bank})` : ""}` }))} />
            <Feld name="angebotVom" label={tf.angebotVom} typ="date" wert={datum(a.angebotVom)} hinweis={hinweis("angebotVom")} />
            <Feld name="gueltigBis" label={tf.gueltigBis} typ="date" wert={datum(a.gueltigBis)} hinweis={hinweis("gueltigBis")} />
            <Feld name="betrag" label={tf.betrag} wert={zahl(a.betrag, 2)} inputMode="decimal" hinweis={hinweis("betrag")} />
            <Auswahl name="zinsArt" label={tf.zinsArt} wert={a.zinsArt} optionen={(["FEST", "VARIABEL"] as const).map((z) => ({ wert: z, text: t.zinsArten[z] }))} pflicht hinweis={hinweis("zinsArt")} />
            <Feld name="sollzins" label={tf.sollzins} wert={zahl(a.sollzins)} inputMode="decimal" hinweis={hinweis("sollzins")} />
            <Feld name="referenzzins" label={tf.referenzzins} wert={a.referenzzins} hinweis={hinweis("referenzzins", tb.referenzHinweis)} />
            <Feld name="marge" label={tf.marge} wert={zahl(a.marge)} inputMode="decimal" hinweis={hinweis("marge")} />
            <Feld name="zinsbindungMonate" label={tf.zinsbindungMonate} wert={a.zinsbindungMonate?.toString()} inputMode="numeric" hinweis={hinweis("zinsbindungMonate", tb.monateHinweis)} />
            <Feld name="laufzeitMonate" label={tf.laufzeitMonate} wert={a.laufzeitMonate?.toString()} inputMode="numeric" hinweis={hinweis("laufzeitMonate", tb.monateHinweis)} />
            <Auswahl name="zahlweise" label={tf.zahlweise} wert={a.zahlweise} pflicht optionen={(["MONATLICH", "QUARTALSWEISE", "HALBJAEHRLICH", "JAEHRLICH"] as const).map((z) => ({ wert: z, text: t.zahlweisen[z] }))} />
            <Auswahl name="tilgungsart" label={tf.tilgungsart} wert={a.tilgungsart} pflicht optionen={(["ANNUITAET", "RATENTILGUNG", "ENDFAELLIG"] as const).map((z) => ({ wert: z, text: t.tilgungsarten[z] }))} />
            <Feld name="tilgungProzent" label={tf.tilgungProzent} wert={zahl(a.tilgungProzent)} inputMode="decimal" hinweis={hinweis("tilgungProzent")} />
            <Feld name="auszahlungProzent" label={tf.auszahlungProzent} wert={zahl(a.auszahlungProzent)} inputMode="decimal" hinweis={hinweis("auszahlungProzent")} />
            <Feld name="bearbeitungsgebuehr" label={tf.bearbeitungsgebuehr} wert={zahl(a.bearbeitungsgebuehr, 2)} inputMode="decimal" hinweis={hinweis("bearbeitungsgebuehr")} />
            <Feld name="sonstigeKosten" label={tf.sonstigeKosten} wert={zahl(a.sonstigeKosten, 2)} inputMode="decimal" hinweis={hinweis("sonstigeKosten")} />
            <Feld name="bereitstellungszins" label={tf.bereitstellungszins} wert={zahl(a.bereitstellungszins)} inputMode="decimal" hinweis={hinweis("bereitstellungszins")} />
            <Feld name="bereitstellungsfreiMonate" label={tf.bereitstellungsfreiMonate} wert={a.bereitstellungsfreiMonate?.toString()} inputMode="numeric" hinweis={hinweis("bereitstellungsfreiMonate")} />
            <Feld name="sondertilgungProzent" label={tf.sondertilgungProzent} wert={zahl(a.sondertilgungProzent)} inputMode="decimal" hinweis={hinweis("sondertilgungProzent")} />
          </Felder>
          <Textfeld name="covenants" label={tf.covenants} wert={a.covenants} />
          {hinweis("covenants") && <p className="-mt-2 text-xs text-slate-500">{hinweis("covenants")}</p>}
          <Textfeld name="sicherheiten" label={tf.sicherheiten} wert={a.sicherheiten} />
          <Textfeld name="notiz" label={tf.notiz} wert={a.notiz} />
          <button type="submit" name="modus" value="bestaetigen" className={knopfKlasse("primaer")} data-bestaetigen>
            {tb.bestaetigen}
          </button>
        </Formular>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <Formular aktion={angebotLoeschen.bind(null, a.id)} absenden={tb.loeschen} art="gefahr" bestaetigen={tb.loeschenBestaetigen} />
        </div>
      </Karte>
    </div>
  );
}
