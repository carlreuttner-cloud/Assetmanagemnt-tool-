import Link from "next/link";
import { Balkendiagramm, Liniendiagramm } from "@/components/diagramme";
import { Begriff, Glossar, Kennzahl } from "@/components/herleitung";
import { Kachel, Kacheln, Karte, Leer, Marke, Reiter, Seitenkopf, Tabelle, rechts, MieteZelle } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { idFilter } from "@/lib/auth/sichtbarkeit";
import { formatMonat, heute, monatsende, monatsNummer } from "@/lib/datum";
import { ladeRechengrundlage } from "@/lib/daten/portfolio";
import { dezimal } from "@/lib/geld";
import { formatierer } from "@/lib/format";
import { gruppenKennzahlen, zeitreihe, zinsbindungsProfil } from "@/lib/kennzahlen";
import { ermittleWarnungen, type Warnung } from "@/lib/warnungen";

const ARTEN = ["zinsbindung", "covenant", "rueckstand", "leerstand"] as const;
const MAX_WARNUNGEN = 12;

export default async function UebersichtSeite({ searchParams }: PageProps<"/">) {
  const kontext = await pruefeZugriff("uebersicht");
  const t = texte(kontext.mandant.sprache);
  const tu = t.uebersicht;
  const tk = t.kennzahlen;
  const f = formatierer(kontext.mandant);
  const stichtag = heute();
  const sp = await searchParams;
  const { haeuser, kredite, referenzwerte, sicht } = await ladeRechengrundlage(kontext);

  const [gesellschaften, hausNamen, covenants] = await Promise.all([
    kontext.db.gesellschaft.findMany({ where: { id: idFilter(sicht.gesellschaftIds) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    kontext.db.haus.findMany({ where: { id: { in: haeuser.map((h) => h.id) } }, select: { id: true, bezeichnung: true } }),
    kontext.db.covenant.findMany({
      where: { kreditId: { in: kredite.map((k) => k.id) } },
      select: { kreditId: true, kennzahl: true, vergleich: true, schwellenwert: true },
    }),
  ]);

  if (haeuser.length === 0 && kredite.length === 0) {
    return (
      <div>
        <Seitenkopf titel={tu.titel} beschreibung={t.seiten.uebersicht} />
        <Leer>{tu.leer}</Leer>
      </div>
    );
  }

  const gesamt = gruppenKennzahlen(haeuser, kredite, referenzwerte, stichtag);
  const warnungen = ermittleWarnungen(
    haeuser,
    kredite,
    covenants.map((c) => ({ ...c, schwellenwert: c.schwellenwert ? dezimal(c.schwellenwert) : null })),
    referenzwerte,
    stichtag,
  );

  // Verlauf: 24 Monate zurück (nur belegte Werte; Planwerte je Kredit auf der Kreditseite)
  const jetzt = monatsNummer(stichtag);
  const vergangen = Array.from({ length: 25 }, (_, i) => monatsende(jetzt - 24 + i));
  const reiheVorher = zeitreihe(haeuser, kredite, [...vergangen.slice(0, -1), stichtag]);
  const profil = zinsbindungsProfil(kredite, stichtag);
  const jeGesellschaft = gesellschaften
    .map((g) => ({
      g,
      k: gruppenKennzahlen(
        haeuser.filter((h) => h.gesellschaftId === g.id),
        kredite.filter((k) => k.gesellschaftId === g.id),
        referenzwerte,
        stichtag,
      ),
    }))
    .filter((x) => x.k.haeuser > 0 || !x.k.restschuld.isZero());

  // Namen und Links
  const hausName = new Map(hausNamen.map((h) => [h.id, h.bezeichnung]));
  const kreditName = new Map(kredite.map((k) => [k.id, k.bezeichnung]));
  const darfGesellschaften = darf(kontext.rolle, "gesellschaften");
  const darfHaeuser = darf(kontext.rolle, "haeuser");
  const darfMieter = darf(kontext.rolle, "mieter");

  const filter = ARTEN.find((a) => a === sp.warnung) ?? null;
  const gefiltert = filter ? warnungen.filter((w) => w.art === filter) : warnungen;
  const alle = sp.alle === "1";
  const sichtbar = alle ? gefiltert : gefiltert.slice(0, MAX_WARNUNGEN);
  const link = (w: Warnung): { href: string | null; name: string } => {
    if (w.art === "zinsbindung" || w.art === "covenant") {
      return { href: darfGesellschaften ? `/gesellschaften/kredite/${w.kreditId}` : null, name: kreditName.get(w.kreditId) ?? "" };
    }
    const href = w.art === "rueckstand" && darfMieter ? `/mieter?status=rueckstand&haus=${w.hausId}` : darfHaeuser ? `/haeuser/${w.hausId}` : null;
    return { href, name: hausName.get(w.hausId) ?? "" };
  };
  const text = (w: Warnung) => {
    switch (w.art) {
      case "zinsbindung":
        return w.bis < stichtag
          ? fuelle(tu.zinsbindungAbgelaufen, { datum: f.datum(w.bis), restschuld: w.restschuld ? f.betragGanz(w.restschuld) : t.allgemein.unbekannt })
          : fuelle(tu.zinsbindungText, {
              wann: w.monate === 0 ? tu.diesenMonat : w.monate === 1 ? tu.inEinemMonat : fuelle(tu.inMonaten, { monate: w.monate }),
              datum: f.datum(w.bis),
              restschuld: w.restschuld ? f.betragGanz(w.restschuld) : t.allgemein.unbekannt,
            });
      case "covenant": {
        const prozent = w.kennzahl === "LTV";
        const werte = {
          kennzahl: w.kennzahl,
          wert: prozent ? f.prozent(w.wert, 1) : f.faktor(w.wert),
          vergleich: t.vergleiche[w.vergleich],
          schwelle: prozent ? f.prozent(w.schwellenwert, 1) : f.faktor(w.schwellenwert),
        };
        return fuelle(w.stufe === "hoch" ? tu.covenantVerletzt : tu.covenantKnapp, werte);
      }
      case "rueckstand":
        return (
          fuelle(tu.rueckstandText, { anzahl: w.anzahl, summe: f.betrag(w.summe) }) +
          (w.anzahlHoch > 0 ? fuelle(tu.rueckstandHoch, { anzahl: w.anzahlHoch }) : "")
        );
      case "leerstand":
        return fuelle(tu.leerstandText, {
          quote: f.prozent(w.quote, 1),
          einheiten: w.leereEinheiten,
          gesamt: w.einheiten,
          monat: f.betrag(w.erwartetMonat),
          jahr: f.jahresmiete(w.erwartetMonat),
        });
    }
  };
  const query = (warnung: string | null, mitAlle = false) => {
    const q = new URLSearchParams();
    if (warnung) q.set("warnung", warnung);
    if (mitAlle) q.set("alle", "1");
    const s = q.toString();
    return s ? `/?${s}#warnungen` : "/#warnungen";
  };

  const p = { k: gesamt, t, f, stichtag };
  const gesamtMiete = jeGesellschaft.reduce((s, x) => s.plus(x.k.sollJahr), dezimal(0));

  return (
    <div className="space-y-6">
      <Seitenkopf titel={tu.titel} beschreibung={`${t.seiten.uebersicht} ${fuelle(tu.stand, { datum: f.datum(stichtag) })}`} />

      <Kacheln>
        <Kachel
          titel={tk.verkehrswert}
          wert={<Kennzahl art="verkehrswert" {...p} ganz />}
          unter={
            <>
              {tk.kaufpreis}: <Kennzahl art="kaufpreis" {...p} ganz />
            </>
          }
        />
        <Kachel
          titel={<Begriff k="Restschuld" t={t}>{tk.restschuld}</Begriff>}
          wert={<Kennzahl art="restschuld" {...p} ganz />}
          unter={
            <>
              <Begriff k="LTV" t={t} />: <Kennzahl art="ltv" {...p} />
            </>
          }
          ton={gesamt.ltv && gesamt.ltv.greaterThan(70) ? "warnung" : undefined}
        />
        <Kachel titel={tu.eigenkapital} wert={<Kennzahl art="eigenkapital" {...p} ganz />} unter={`${gesamt.haeuser} ${tk.haeuser} · ${kredite.length} ${tk.kredite}`} />
        <Kachel
          titel={
            <>
              {tk.sollMieteJahr} (<Begriff k="JNKM" t={t} />)
            </>
          }
          wert={<Kennzahl art="sollJahr" {...p} />}
          unter={
            <>
              {tk.sollMieteMonat}: <Kennzahl art="sollMonat" {...p} /> · {tk.istMieteJahr}: <Kennzahl art="istJahr" {...p} />
            </>
          }
        />
        <Kachel
          titel={<Begriff k="Leerstand" t={t}>{tk.leerstandFlaeche}</Begriff>}
          wert={<Kennzahl art="leerstand" {...p} />}
          unter={
            <>
              {`${gesamt.leereEinheiten} / ${gesamt.einheiten} ${tk.einheiten} · ${tk.erwartetLeer}: `}
              <Kennzahl art="erwartetLeerMonat" {...p} /> ({t.allgemein.jahr} {f.jahresmiete(gesamt.erwartetLeerMonat)})
            </>
          }
          ton={gesamt.leerstandQuote && gesamt.leerstandQuote.greaterThanOrEqualTo(10) ? "warnung" : undefined}
        />
        <Kachel titel={tk.rueckstand} wert={f.betrag(gesamt.rueckstand)} ton={gesamt.rueckstand.greaterThan(0) ? "schlecht" : undefined} />
        <Kachel
          titel={
            <>
              <Begriff k="DSCR" t={t} /> / <Begriff k="ICR" t={t} />
            </>
          }
          wert={<Kennzahl art="dscr" {...p} />}
          unter={
            <>
              <Begriff k="Kapitaldienst" t={t}>{tk.kapitaldienstJahr}</Begriff>: <Kennzahl art="kapitaldienst" {...p} ganz /> · <Begriff k="ICR" t={t} />:{" "}
              <Kennzahl art="icr" {...p} />
            </>
          }
          ton={gesamt.dscr && gesamt.dscr.lessThan("1.2") ? "warnung" : undefined}
        />
        <Kachel
          titel={<Begriff k="BAR" t={t}>{tk.bruttoanfangsrendite}</Begriff>}
          wert={<Kennzahl art="bruttoanfangsrendite" {...p} />}
          unter={
            <>
              <Begriff k="Kaufpreisfaktor" t={t}>{tk.kaufpreisfaktor}</Begriff>: <Kennzahl art="kaufpreisfaktor" {...p} /> · {tk.mietrendite}:{" "}
              <Kennzahl art="mietrendite" {...p} />
            </>
          }
        />
      </Kacheln>

      <div id="warnungen">
        <Karte titel={`${tu.warnungen} (${warnungen.length})`}>
          <Reiter
            eintraege={[
              { href: query(null), text: fuelle(tu.filterAlle, { anzahl: warnungen.length }), aktiv: filter === null },
              ...ARTEN.map((a) => ({
                href: query(a),
                text: `${tu.arten[a]} (${warnungen.filter((w) => w.art === a).length})`,
                aktiv: filter === a,
              })),
            ]}
          />
          {gefiltert.length === 0 ? (
            <Leer>{tu.keineWarnungen}</Leer>
          ) : (
            <ul className="divide-y divide-slate-100">
              {sichtbar.map((w, i) => {
                const ziel = link(w);
                return (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm">
                    <Marke ton={w.stufe === "hoch" ? "schlecht" : "warnung"}>{tu.stufen[w.stufe]}</Marke>
                    <span className="w-24 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500">{tu.arten[w.art]}</span>
                    {ziel.href ? (
                      <Link href={ziel.href} className="font-medium hover:underline">
                        {ziel.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{ziel.name}</span>
                    )}
                    <span className="text-slate-600">{text(w)}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {!alle && gefiltert.length > MAX_WARNUNGEN && (
            <Link href={query(filter, true)} className="mt-2 inline-block text-sm text-slate-700 underline">
              {fuelle(tu.alleAnzeigen, { anzahl: gefiltert.length })}
            </Link>
          )}
          <p className="mt-3 text-xs text-slate-500">{tu.schwellenHinweis}</p>
        </Karte>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Karte titel={tu.entwicklung} className="xl:col-span-3">
          <Liniendiagramm
            reihen={[
              { name: tk.verkehrswert, punkte: reiheVorher.map((x) => ({ x: x.datum, y: x.verkehrswert })) },
              { name: tu.restschuldBelegt, punkte: reiheVorher.map((x) => ({ x: x.datum, y: x.restschuld })) },
            ]}
            formatY={(w) => f.betragKurz(w)}
            formatX={(d) => formatMonat(d)}
            ab0
          />
          <p className="mt-2 text-xs text-slate-500">{tu.entwicklungHinweis}</p>
        </Karte>
        <Karte titel={tu.zinsbindungsprofil} className="xl:col-span-2">
          <Balkendiagramm
            balken={profil.map((g) => ({
              name: g.jahr === "variabel" ? tu.variabel : g.jahr,
              wert: g.restschuld,
              zusatz:
                (g.anzahl === 1 ? tu.einKredit : fuelle(tu.kreditAnzahl, { anzahl: g.anzahl })) +
                (g.ohneBeleg > 0 ? ` · ${fuelle(tu.ohneBeleg, { anzahl: g.ohneBeleg })}` : ""),
              farbe: g.jahr === "variabel" ? "#7c3aed" : Number(g.jahr) <= Number(stichtag.slice(0, 4)) + 1 ? "#be123c" : "#0f766e",
            }))}
            format={(w) => f.betragKurz(w)}
          />
        </Karte>
      </div>

        <Karte titel={tu.gesellschaften}>
          <Tabelle>
            <thead>
              <tr>
                <th>{t.gesellschaften.name}</th>
                <th className={rechts}>{tk.verkehrswert}</th>
                <th className={rechts}>{tk.restschuld}</th>
                <th className={rechts}>
                  <Begriff k="LTV" t={t} />
                </th>
                <th className={rechts}>
                  {tk.sollMiete} ({t.allgemein.monat} / {t.allgemein.jahr})
                </th>
                <th className={rechts}>{tu.anteilMiete}</th>
                <th className={rechts}>{tk.leerstand}</th>
                <th className={rechts}>
                  <Begriff k="DSCR" t={t} />
                </th>
              </tr>
            </thead>
            <tbody>
              {jeGesellschaft.map(({ g, k }) => (
                <tr key={g.id}>
                  <td>
                    {darfGesellschaften ? (
                      <Link href={`/gesellschaften/${g.id}`} className="font-medium hover:underline">
                        {g.name}
                      </Link>
                    ) : (
                      g.name
                    )}
                  </td>
                  <td className={rechts}>
                    <Kennzahl art="verkehrswert" k={k} t={t} f={f} stichtag={stichtag} ganz ausrichtung="rechts" />
                  </td>
                  <td className={rechts}>
                    <Kennzahl art="restschuld" k={k} t={t} f={f} stichtag={stichtag} ganz ausrichtung="rechts" />
                  </td>
                  <td className={rechts}>
                    <Kennzahl art="ltv" k={k} t={t} f={f} stichtag={stichtag} ausrichtung="rechts" />
                  </td>
                  <td className={rechts}>
                    <MieteZelle monat={f.betrag(k.sollMonat)} jahr={f.betrag(k.sollJahr)} />
                  </td>
                  <td className={rechts}>{gesamtMiete.isZero() ? "–" : f.prozent(k.sollJahr.dividedBy(gesamtMiete).times(100), 1)}</td>
                  <td className={rechts}>{f.prozent(k.leerstandQuote, 1)}</td>
                  <td className={rechts}>
                    <Kennzahl art="dscr" k={k} t={t} f={f} stichtag={stichtag} ausrichtung="rechts" />
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabelle>
        </Karte>

      <Glossar begriffe={["Restschuld", "LTV", "DSCR", "ICR", "JNKM", "Kapitaldienst", "Leerstand", "BAR", "Kaufpreisfaktor", "Zinsbindung", "Covenant"]} t={t} />
    </div>
  );
}
