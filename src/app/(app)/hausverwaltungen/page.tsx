import Link from "next/link";
import { Liniendiagramm } from "@/components/diagramme";
import { Formular } from "@/components/formular";
import { MitHerleitung } from "@/components/herleitung";
import { Feld, Felder, Karte, Leer, MieteZelle, Seitenkopf, Tabelle, Textfeld, rechts } from "@/components/ui";
import { texte } from "@/i18n";
import { bereichsSicht } from "@/lib/auth/auswahl";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { idFilter } from "@/lib/auth/sichtbarkeit";
import { heute } from "@/lib/datum";
import { ladeHausBestand, ladeHausverwaltungen, ladeZuordnungen } from "@/lib/daten/hausverwaltung";
import { ladeStaende } from "@/lib/daten/mieterstand";
import { DIAGRAMM_FARBEN } from "@/lib/farben";
import { formatierer } from "@/lib/format";
import { dezimal } from "@/lib/geld";
import { entwicklung, haeuserAm } from "@/lib/hausverwaltung";
import { hausverwaltungSpeichern } from "./aktionen";

export default async function HausverwaltungenSeite() {
  const kontext = await pruefeZugriff("haeuser");
  const t = texte(kontext.mandant.sprache);
  const th = t.hausverwaltungen;
  const f = formatierer(kontext.mandant);
  const stichtag = heute();
  const schreiben = darf(kontext.rolle, "haeuser", "schreiben");
  const sicht = await bereichsSicht(kontext);
  const [verwaltungen, zuordnungen, staende, haeuser] = await Promise.all([
    ladeHausverwaltungen(kontext),
    ladeZuordnungen(kontext),
    ladeStaende(kontext, idFilter(sicht.hausIds)),
    kontext.db.haus.findMany({ where: { id: idFilter(sicht.hausIds) }, select: { id: true, bezeichnung: true } }),
  ]);
  const hausName = new Map(haeuser.map((h) => [h.id, h.bezeichnung]));
  const zeilen = await Promise.all(
    verwaltungen.map(async (v) => {
      const ids = haeuserAm(zuordnungen, v.id, stichtag).filter((id) => hausName.has(id));
      const bestand = await ladeHausBestand(kontext, ids, stichtag);
      const flaeche = bestand.reduce((s, h) => s.plus(h.flaeche), dezimal(0));
      const leerFlaeche = bestand.reduce((s, h) => s.plus(h.leerFlaeche), dezimal(0));
      const leere = bestand.flatMap((h) => h.leere);
      const ohneErwartet = leere.filter((l) => !l.erwarteteMiete).length;
      const entgangen = leere.reduce((s, l) => s.plus(l.erwarteteMiete ?? 0), dezimal(0));
      return { v, ids, einheiten: bestand.reduce((s, h) => s + h.einheiten, 0), flaeche, leerFlaeche, quote: flaeche.isZero() ? null : leerFlaeche.dividedBy(flaeche).times(100), leere: leere.length, entgangen, ohneErwartet };
    }),
  );
  const reihen = verwaltungen.map((v, i) => ({
    name: v.name,
    farbe: DIAGRAMM_FARBEN[i % DIAGRAMM_FARBEN.length],
    punkte: entwicklung(staende, { zuordnungen, hausverwaltungId: v.id }).map((p) => ({ x: p.stichtag, y: p.summen.leerQuote.wert })),
  }));

  return (
    <div className="max-w-6xl space-y-6">
      <Seitenkopf titel={t.navigation.hausverwaltungen} beschreibung={t.seiten.hausverwaltungen} />
      <Karte titel={t.navigation.hausverwaltungen}>
        {verwaltungen.length === 0 ? (
          <Leer>{th.keine}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{th.name}</th>
                <th>{th.haeuserAktuell}</th>
                <th className={rechts}>{th.einheiten}</th>
                <th className={rechts}>{th.leerstand}</th>
                <th className={rechts}>{th.spalten.entgangenMonat}</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z) => (
                <tr key={z.v.id} data-hausverwaltung={z.v.name}>
                  <td>
                    <Link href={`/hausverwaltungen/${z.v.id}`} className="font-medium hover:underline">
                      {z.v.name}
                    </Link>
                    {z.v.ansprechpartner && <div className="text-xs text-slate-500">{z.v.ansprechpartner}</div>}
                  </td>
                  <td className="text-sm">{z.ids.map((id) => hausName.get(id)).join(", ") || "–"}</td>
                  <td className={rechts}>{z.einheiten}</td>
                  <td className={rechts}>
                    <MitHerleitung
                      ausrichtung="rechts"
                      t={t}
                      wert={`${z.leere} · ${f.prozent(z.quote, 1)}`}
                      herleitung={{ berechnung: t.mieterstand.herleitung.leerQuote, werte: [[t.mieterstand.summen.leerFlaeche, f.flaeche(z.leerFlaeche)], [t.mieterstand.summen.flaeche, f.flaeche(z.flaeche)]], stichtag: f.datum(stichtag) }}
                    />
                  </td>
                  <td className={rechts}>
                    <MieteZelle monat={f.betrag(z.entgangen)} jahr={f.jahresmiete(z.entgangen)} />
                    {z.ohneErwartet > 0 && <div className="text-xs text-amber-700">{`${z.ohneErwartet} × ${th.keineErwartete} (${t.allgemein.unvollstaendig})`}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabelle>
        )}
      </Karte>

      {reihen.some((r) => r.punkte.length > 0) && (
        <Karte titel={th.entwicklungVergleich}>
          <p className="mb-3 text-xs text-slate-500">{th.entwicklungVergleichBeschreibung}</p>
          <Liniendiagramm reihen={reihen} formatY={(w) => f.prozent(w, 1)} formatX={(d) => f.datum(d).slice(3)} ab0 />
          <p className="mt-2 text-xs text-slate-500">{th.lueckeHinweis}</p>
        </Karte>
      )}

      {schreiben && (
        <Karte titel={th.neu}>
          <Formular aktion={hausverwaltungSpeichern} absenden={t.allgemein.speichern} className="space-y-3" zuruecksetzen>
            <Felder>
              <Feld name="name" label={th.name} pflicht />
              <Feld name="ansprechpartner" label={th.ansprechpartner} />
              <Feld name="email" label={th.email} typ="email" />
              <Feld name="telefon" label={th.telefon} />
              <Textfeld name="notiz" label={th.notiz} />
            </Felder>
          </Formular>
        </Karte>
      )}
    </div>
  );
}
