import Link from "next/link";
import { notFound } from "next/navigation";
import { CovenantMarke, ZinsbindungMarke } from "@/components/kredit-marken";
import { Angaben, Kachel, Kacheln, Karte, KnopfLink, Leer, MieteZelle, Seitenkopf, Tabelle, rechts } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { heute } from "@/lib/datum";
import { erlaubt, ladeRechengrundlage } from "@/lib/daten/portfolio";
import { dezimal } from "@/lib/geld";
import { formatierer } from "@/lib/format";
import { covenantKennzahlen, gruppenKennzahlen, hausKennzahlen } from "@/lib/kennzahlen";
import { kapitaldienstJahr, pruefeCovenant, restschuld, zinsbindung, zinssatz } from "@/lib/kredit";

export default async function GesellschaftSeite({ params }: PageProps<"/gesellschaften/[id]">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("gesellschaften");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const stichtag = heute();

  const grundlage = await ladeRechengrundlage(kontext);
  const g = await kontext.db.gesellschaft.findFirst({
    where: { id: erlaubt(grundlage.sicht.gesellschaftIds, id) },
    include: {
      haeuser: { orderBy: { bezeichnung: "asc" }, select: { id: true, bezeichnung: true, plz: true, ort: true } },
      kredite: { orderBy: { bezeichnung: "asc" }, include: { covenants: true } },
    },
  });
  if (!g) notFound();

  const { haeuser, kredite, referenzwerte } = grundlage;
  const eigeneHaeuser = haeuser.filter((h) => h.gesellschaftId === id);
  const eigeneKredite = kredite.filter((k) => k.gesellschaftId === id);
  const k = gruppenKennzahlen(eigeneHaeuser, eigeneKredite, referenzwerte, stichtag);
  const schreiben = darf(kontext.rolle, "gesellschaften", "schreiben");
  const tk = t.kennzahlen;

  return (
    <div className="space-y-6">
      <Seitenkopf
        titel={g.name}
        beschreibung={g.rechtsform}
        zurueck={{ href: "/gesellschaften", text: t.gesellschaften.titel }}
        aktionen={
          schreiben && (
            <>
              <KnopfLink href={`/gesellschaften/${id}/bearbeiten`}>{t.allgemein.bearbeiten}</KnopfLink>
              <KnopfLink href={`/gesellschaften/kredite/neu?gesellschaft=${id}`} art="primaer">
                {t.kredite.neu}
              </KnopfLink>
            </>
          )
        }
      />

      <Kacheln>
        <Kachel titel={tk.verkehrswert} wert={f.betragGanz(k.verkehrswert)} unter={`${k.haeuser} ${tk.haeuser}, ${k.einheiten} ${tk.einheiten}`} />
        <Kachel titel={tk.restschuld} wert={f.betragGanz(k.restschuld)} unter={`${tk.ltv} ${f.prozent(k.ltv, 1)}`} />
        <Kachel titel={tk.sollMieteMonat} wert={f.betrag(k.sollMonat)} unter={`${tk.sollMieteJahr}: ${f.betrag(k.sollJahr)}`} />
        <Kachel titel={tk.istMieteMonat} wert={f.betrag(k.istMonat)} unter={`${tk.istMieteJahr}: ${f.betrag(k.istJahr)}`} />
        <Kachel titel={tk.leerstandFlaeche} wert={f.prozent(k.leerstandQuote, 1)} unter={`${tk.erwartetLeer}: ${f.betrag(k.erwartetLeerMonat)} / ${f.betrag(k.erwartetLeerJahr)}`} />
        <Kachel titel={tk.kapitaldienstJahr} wert={f.betragGanz(k.kapitaldienstJahr)} unter={`${tk.zinsenJahr}: ${f.betragGanz(k.zinsenJahr)}`} />
        <Kachel titel={tk.dscrLang} wert={f.faktor(k.dscr)} unter={tk.hinweisDscr} />
        <Kachel titel={tk.bruttoanfangsrendite} wert={f.prozent(k.bruttoanfangsrendite)} unter={`${tk.kaufpreisfaktor}: ${f.faktor(k.kaufpreisfaktor, 1)}`} />
      </Kacheln>

      <Karte titel={t.gesellschaften.kredite}>
        {g.kredite.length === 0 ? (
          <Leer>{t.gesellschaften.keineKredite}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{t.kredite.bezeichnung}</th>
                <th>{t.kredite.bank}</th>
                <th>{t.kredite.zinsArt}</th>
                <th className={rechts}>{t.kredite.zinssatzAktuell}</th>
                <th className={rechts}>{tk.restschuld}</th>
                <th className={rechts}>{tk.kapitaldienstJahr}</th>
                <th>{t.kredite.zinsbindung}</th>
                <th>{t.kredite.covenants}</th>
              </tr>
            </thead>
            <tbody>
              {g.kredite.map((zeile) => {
                const daten = eigeneKredite.find((x) => x.id === zeile.id)!;
                const kd = kapitaldienstJahr(daten, referenzwerte, stichtag);
                const werte = covenantKennzahlen(daten, haeuser, kredite, referenzwerte, stichtag);
                const pruefungen = zeile.covenants.map((c) =>
                  pruefeCovenant(
                    { kennzahl: c.kennzahl, vergleich: c.vergleich, schwellenwert: c.schwellenwert ? dezimal(c.schwellenwert) : null },
                    { LTV: werte.ltv, DSCR: werte.dscr, ICR: werte.icr },
                  ),
                );
                const verletzt = pruefungen.some((p) => p.eingehalten === false);
                return (
                  <tr key={zeile.id} className="hover:bg-slate-50">
                    <td>
                      <Link href={`/gesellschaften/kredite/${zeile.id}`} className="font-medium hover:underline">
                        {zeile.bezeichnung}
                      </Link>
                      <div className="text-xs text-slate-500">{zeile.kreditnummer}</div>
                    </td>
                    <td>{zeile.bank}</td>
                    <td>
                      {t.zinsArten[zeile.zinsArt]}
                      {zeile.referenzzins && <div className="text-xs text-slate-500">{zeile.referenzzins}</div>}
                    </td>
                    <td className={rechts}>{f.prozent(zinssatz(daten, referenzwerte, stichtag), 3)}</td>
                    <td className={rechts}>{f.betrag(restschuld(daten, stichtag))}</td>
                    <td className={rechts}>
                      {f.betrag(kd.summe)}
                      {kd.quelle === "schaetzung" && <div className="text-xs text-slate-500">{t.kredite.schaetzung}</div>}
                    </td>
                    <td>
                      <ZinsbindungMarke zb={zinsbindung(daten, stichtag)} t={t} f={f} />
                    </td>
                    <td>{pruefungen.length > 0 && <CovenantMarke eingehalten={verletzt ? false : pruefungen.every((p) => p.eingehalten) ? true : null} t={t} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </Tabelle>
        )}
      </Karte>

      <Karte titel={t.gesellschaften.haeuser}>
        {g.haeuser.length === 0 ? (
          <Leer>{t.gesellschaften.keineHaeuser}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{t.allgemein.bezeichnung}</th>
                <th className={rechts}>{tk.verkehrswert}</th>
                <th className={rechts}>{tk.restschuld}</th>
                <th className={rechts}>{tk.ltv}</th>
                <th className={rechts}>
                  {tk.sollMiete} ({t.allgemein.monat} / {t.allgemein.jahr})
                </th>
                <th className={rechts}>{tk.leerstand}</th>
              </tr>
            </thead>
            <tbody>
              {g.haeuser.map((h) => {
                const daten = eigeneHaeuser.find((x) => x.id === h.id);
                if (!daten) return null;
                const hk = hausKennzahlen(daten, kredite, referenzwerte, stichtag);
                return (
                  <tr key={h.id}>
                    <td>
                      <HausLink id={h.id} text={h.bezeichnung} />
                      <div className="text-xs text-slate-500">{[h.plz, h.ort].filter(Boolean).join(" ")}</div>
                    </td>
                    <td className={rechts}>{f.betragGanz(hk.verkehrswert)}</td>
                    <td className={rechts}>{f.betragGanz(hk.restschuld)}</td>
                    <td className={rechts}>{f.prozent(hk.ltv, 1)}</td>
                    <td className={rechts}>
                      <MieteZelle monat={f.betrag(hk.sollMonat)} jahr={f.betrag(hk.sollJahr)} />
                    </td>
                    <td className={rechts}>{f.prozent(hk.leerstandQuote, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </Tabelle>
        )}
      </Karte>

      <Karte titel={t.gesellschaften.stammdaten}>
        <Angaben
          eintraege={[
            [t.gesellschaften.rechtsform, g.rechtsform],
            [t.gesellschaften.registernummer, g.registernummer],
            [t.gesellschaften.steuernummer, g.steuernummer],
            [t.allgemein.notiz, g.notiz],
          ]}
        />
      </Karte>
    </div>
  );
}

function HausLink({ text }: { id: string; text: string }) {
  return <span className="font-medium">{text}</span>;
}
