import Link from "next/link";
import { AuswahlFilter, FilterZeile } from "@/components/auswahl-filter";
import { Jahressaeulen } from "@/components/diagramme";
import { Begriff, Glossar, MitHerleitung, Unbekannt } from "@/components/herleitung";
import { Kachel, Kacheln, Karte, Leer, Marke, Seitenkopf, Tabelle, rechts } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { ladeInstandhaltung } from "@/lib/daten/instandhaltung";
import { formatierer } from "@/lib/format";
import { faelligBis, kostenJeJahr, VORSCHAU_JAHRE } from "@/lib/instandhaltung";
import { STATUS_TON } from "./ton";

export default async function InstandhaltungSeite({ searchParams }: PageProps<"/instandhaltung">) {
  const kontext = await pruefeZugriff("haeuser");
  const t = texte(kontext.mandant.sprache);
  const ti = t.instandhaltung;
  const f = formatierer(kontext.mandant);
  const sp = await searchParams;
  const gesellschaftId = typeof sp.gesellschaft === "string" ? sp.gesellschaft : undefined;
  const nurFaellig = sp.faellig === "1";
  const alle = await ladeInstandhaltung(kontext);
  const { jahr } = alle;
  const gesellschaften = [...new Map(alle.haeuser.map((h) => [h.gesellschaftId, h.gesellschaft])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const haeuser = gesellschaftId ? alle.haeuser.filter((h) => h.gesellschaftId === gesellschaftId) : alle.haeuser;
  const bisJahr = jahr + VORSCHAU_JAHRE;
  const bauteile = haeuser.flatMap((h) => h.bauteile.map((b) => ({ ...b, haus: h })));
  const zeilen = bauteile
    .filter((b) => !nurFaellig || (b.naechste !== null && b.naechste <= bisJahr))
    .sort((a, b) => (a.naechste ?? 9999) - (b.naechste ?? 9999) || a.haus.bezeichnung.localeCompare(b.haus.bezeichnung));
  const anzahl = (s: string) => bauteile.filter((b) => b.status === s).length;
  const bald = faelligBis(bauteile, jahr, bisJahr);
  const jahre = kostenJeJahr(bauteile, jahr);
  const href = (p: { gesellschaft?: string; faellig?: boolean }) => {
    const q = new URLSearchParams();
    if (p.gesellschaft) q.set("gesellschaft", p.gesellschaft);
    if (p.faellig) q.set("faellig", "1");
    const s = q.toString();
    return s ? `/instandhaltung?${s}` : "/instandhaltung";
  };

  return (
    <div className="max-w-6xl space-y-6">
      <Seitenkopf titel={t.navigation.instandhaltung} beschreibung={t.seiten.instandhaltung} />
      <FilterZeile>
        <AuswahlFilter
          name="gesellschaft"
          label={t.listen.gesellschaft}
          optionen={[{ href: href({ faellig: nurFaellig }), text: ti.filterAlle, aktiv: !gesellschaftId }, ...gesellschaften.map(([id, name]) => ({ href: href({ gesellschaft: id, faellig: nurFaellig }), text: name, aktiv: id === gesellschaftId }))]}
        />
        <AuswahlFilter
          name="faellig"
          label={ti.spalten.naechste}
          optionen={[
            { href: href({ gesellschaft: gesellschaftId }), text: ti.alleBauteile, aktiv: !nurFaellig },
            { href: href({ gesellschaft: gesellschaftId, faellig: true }), text: fuelle(ti.nurFaellig, { jahr: bisJahr }), aktiv: nurFaellig },
          ]}
        />
      </FilterZeile>
      <Kacheln>
        <Kachel titel={ti.kacheln.bauteile} wert={bauteile.length} unter={`${haeuser.length} ${t.navigation.haeuser}`} />
        <Kachel titel={ti.kacheln.ueberfaellig} wert={anzahl("ueberfaellig")} ton={anzahl("ueberfaellig") > 0 ? "schlecht" : undefined} />
        <Kachel
          titel={fuelle(ti.kacheln.bald, { jahr: bisJahr })}
          wert={bald.anzahl}
          unter={bald.anzahl === 0 ? undefined : bald.ohneKosten > 0 ? `${fuelle(ti.kostenSumme, { betrag: f.betragGanz(bald.summe) })} · ${fuelle(ti.kostenUnvollstaendig, { anzahl: bald.ohneKosten })}` : fuelle(ti.kostenSumme, { betrag: f.betragGanz(bald.summe) })}
          ton={bald.ohneKosten > 0 ? "warnung" : undefined}
        />
        <Kachel titel={ti.kacheln.unbekannt} wert={anzahl("unbekannt")} ton={anzahl("unbekannt") > 0 ? "warnung" : undefined} />
      </Kacheln>

      <Karte titel={ti.liste}>
        {haeuser.length === 0 ? (
          <Leer>{ti.keineHaeuser}</Leer>
        ) : zeilen.length === 0 ? (
          <Leer>{ti.keineBauteile}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{ti.spalten.bauteil}</th>
                <th>{ti.spalten.haus}</th>
                <th className={rechts}>
                  <Begriff k="Erneuerungszyklus" t={t}>{ti.spalten.zyklus}</Begriff>
                </th>
                <th className={rechts}>{ti.spalten.letzte}</th>
                <th>{ti.spalten.naechste}</th>
                <th className={rechts}>{ti.spalten.kosten}</th>
                <th>{ti.spalten.liquiditaet}</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((b) => (
                <tr key={b.id} data-bauteil={b.bezeichnung}>
                  <td>
                    <span className="font-medium">{b.bezeichnung}</span>
                    <div className="text-xs text-slate-500">{ti.arten[b.art]}</div>
                  </td>
                  <td>
                    <Link href={`/instandhaltung/${b.haus.id}`} className="hover:underline">
                      {b.haus.bezeichnung}
                    </Link>
                    <div className="text-xs text-slate-500">{b.haus.gesellschaft}</div>
                  </td>
                  <td className={rechts}>{b.zyklusJahre === null ? <Unbekannt t={t} /> : fuelle(ti.jahre, { anzahl: b.zyklusJahre })}</td>
                  <td className={rechts}>{b.letzteErneuerung ?? <Unbekannt t={t} />}</td>
                  <td className="whitespace-nowrap">
                    {b.naechste === null ? (
                      <Unbekannt t={t} />
                    ) : (
                      <MitHerleitung
                        wert={String(b.naechste)}
                        herleitung={{ berechnung: ti.naechsteHerleitung, werte: [[ti.spalten.letzte, String(b.letzteErneuerung)], [ti.spalten.zyklus, fuelle(ti.jahre, { anzahl: b.zyklusJahre! })]] }}
                        t={t}
                      />
                    )}{" "}
                    <Marke ton={STATUS_TON[b.status]}>{ti.stati[b.status]}</Marke>
                  </td>
                  <td className={rechts}>
                    {b.geplanteKosten === null ? (
                      <Unbekannt t={t} />
                    ) : (
                      <MitHerleitung wert={f.betragGanz(b.geplanteKosten)} herleitung={{ quelle: b.kostenQuelle ?? undefined, stichtag: b.kostenStand ? f.datum(b.kostenStand) : undefined }} t={t} ausrichtung="rechts" />
                    )}
                  </td>
                  <td>{b.uebernommen ? <Marke ton="gut">{ti.uebernommen}</Marke> : "–"}</td>
                </tr>
              ))}
            </tbody>
          </Tabelle>
        )}
      </Karte>

      {bauteile.length > 0 && (
        <Karte titel={ti.kostenDiagramm}>
          <Jahressaeulen
            jahre={jahre.map((j) => ({ jahr: j.jahr, wert: j.anzahl === 0 ? null : j.summe, entwurf: j.ohneKosten > 0, titel: j.ohneKosten > 0 ? fuelle(ti.jahrUnvollstaendig, { anzahl: j.ohneKosten }) : undefined }))}
            format={(w) => f.betragGanz(w)}
            formatKurz={(w) => f.betragKurz(w)}
            legende={{ beleg: ti.legendeKosten, entwurf: t.allgemein.unvollstaendig, plan: "" }}
          />
          <p className="mt-2 text-xs text-slate-500">{ti.kostenDiagrammHinweis}</p>
        </Karte>
      )}
      <Glossar begriffe={["Erneuerungszyklus"]} t={t} />
    </div>
  );
}
