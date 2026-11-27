import Link from "next/link";
import { Merken } from "@/components/merken";
import { notFound } from "next/navigation";
import { CovenantMarke, PufferWert, SperrenMarke, ZinsbindungMarke } from "@/components/kredit-marken";
import { covenantPuffer, sperrenStatus } from "@/lib/covenant";
import { Begriff, Glossar, Kennzahl, KapitaldienstWert, RestschuldWert, ZinssatzWert } from "@/components/herleitung";
import { KennzahlKacheln } from "@/components/kennzahl-kacheln";
import { Angaben, Karte, KnopfLink, Leer, MieteZelle, Seitenkopf, Tabelle, rechts } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { heute } from "@/lib/datum";
import { erlaubt, ladeRechengrundlage } from "@/lib/daten/portfolio";
import { dezimal, type Decimal } from "@/lib/geld";
import { formatierer } from "@/lib/format";
import { DokumenteKarte } from "@/components/dokumente";
import { ladeCheckliste } from "@/lib/daten/dokumente";
import { covenantKennzahlen, gruppenKennzahlen, hausKennzahlen } from "@/lib/kennzahlen";
import { ladeGeschaeftsjahre } from "@/lib/daten/finanzen";
import { FinanzKarte } from "./finanzen/finanz-karte";
import { kapitaldienstJahr, pruefeCovenant, restschuldNachweis, zinsbindung } from "@/lib/kredit";
import { LeerstandZelle } from "@/components/nutzungsart";

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
      portfolio: { select: { id: true, name: true } },
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
  const sperren = g.kredite.flatMap((kredit) => {
    const daten = eigeneKredite.find((x) => x.id === kredit.id);
    if (!daten) return [];
    const werte = covenantKennzahlen(daten, haeuser, kredite, referenzwerte, stichtag);
    return kredit.covenants
      .filter((c) => c.folge === "AUSSCHUETTUNGSSPERRE")
      .map((c) => ({
        c,
        kredit,
        werte,
        puffer: covenantPuffer({ kennzahl: c.kennzahl, vergleich: c.vergleich, schwellenwert: c.schwellenwert ? dezimal(c.schwellenwert) : null }, werte),
      }));
  });
  const tk = t.kennzahlen;
  const geschaeftsjahre = await ladeGeschaeftsjahre(kontext, id);
  const dokumente = darf(kontext.rolle, "dokumente") ? await ladeCheckliste(kontext, { bezug: "GESELLSCHAFT", id }) : null;

  return (
    <div className="space-y-6">
      <Seitenkopf
        titel={g.name}
        beschreibung={
          <>
            {g.rechtsform}
            {g.rechtsform && " · "}
            {t.gesellschaften.portfolio}:{" "}
            {g.portfolio ? (
              <Link href={`/portfolios/${g.portfolio.id}`} className="hover:underline">
                {g.portfolio.name}
              </Link>
            ) : (
              t.portfolios.ohne
            )}
          </>
        }
        zurueck={{ href: "/gesellschaften", text: t.gesellschaften.titel }}
        aktionen={
          <>
            <Merken kontext={kontext} t={t} art="gesellschaft" pfad={`/gesellschaften/${id}`} titel={g.name} />
            <KnopfLink href={`/gesellschaften/${id}/waterfall`}>{t.waterfall.titel}</KnopfLink>
            <KnopfLink href={`/gesellschaften/${id}/gesellschafter`}>{t.waterfall.gesellschafterVerwalten}</KnopfLink>
            {schreiben && (
              <>
                <KnopfLink href={`/gesellschaften/${id}/bearbeiten`}>{t.allgemein.bearbeiten}</KnopfLink>
                <KnopfLink href={`/haeuser/neu?gesellschaft=${id}`}>{t.haeuser.neu}</KnopfLink>
                <KnopfLink href={`/gesellschaften/kredite/neu?gesellschaft=${id}`} art="primaer">
                  {t.kredite.neu}
                </KnopfLink>
              </>
            )}
          </>
        }
      />

      <KennzahlKacheln k={k} t={t} f={f} stichtag={stichtag} />

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
                const pruefungen = zeile.covenants.filter((c) => c.folge === "COVENANT").map((c) =>
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
                    <td className={rechts}>
                      <ZinssatzWert k={daten} referenzwerte={referenzwerte} stichtag={stichtag} t={t} f={f} />
                    </td>
                    <td className={rechts}>
                      <RestschuldWert nachweis={restschuldNachweis(daten, stichtag)} t={t} f={f} />
                    </td>
                    <td className={rechts}>
                      <KapitaldienstWert kd={kd} t={t} f={f} />
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

      <Karte titel={<Begriff k="Ausschuettungssperre" t={t}>{t.kredite.ausschuettungssperren}</Begriff>}>
        <p className="mb-3 text-xs text-slate-500">{t.kredite.sperrenHinweis}</p>
        {sperren.length === 0 ? (
          <Leer>{t.kredite.keineSperren}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{t.kredite.titel}</th>
                <th>{t.kredite.vergleich}</th>
                <th className={rechts}>{t.kredite.aktuellerWert}</th>
                <th className={rechts}>
                  <Begriff k="Headroom" t={t}>{t.kredite.puffer}</Begriff>
                </th>
                <th>{t.kredite.status}</th>
              </tr>
            </thead>
            <tbody>
              {sperren.map(({ c, kredit, puffer, werte }) => {
                const ltv = c.kennzahl.toUpperCase() === "LTV";
                const zeige = (w: Decimal | null) => (ltv ? f.prozent(w, 1) : f.faktor(w));
                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/gesellschaften/kredite/${kredit.id}`} className="font-medium hover:underline">
                        {kredit.bezeichnung}
                      </Link>
                      {c.beschreibung && <div className="text-xs text-slate-500">{c.beschreibung}</div>}
                    </td>
                    <td>
                      {c.kennzahl}
                      {c.vergleich && c.schwellenwert && ` ${t.vergleiche[c.vergleich]} ${zeige(dezimal(c.schwellenwert))}`}
                    </td>
                    <td className={rechts}>{puffer ? zeige(puffer.wert) : "–"}</td>
                    <td className={rechts}>
                      {c.vergleich && c.schwellenwert ? <PufferWert puffer={puffer} kennzahl={c.kennzahl} kz={werte} stichtag={stichtag} t={t} f={f} /> : "–"}
                    </td>
                    <td>
                      <SperrenMarke status={sperrenStatus(puffer)} t={t} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Tabelle>
        )}
      </Karte>

      <FinanzKarte gesellschaftId={id} jahre={geschaeftsjahre} schreiben={schreiben} t={t} f={f} />

      {dokumente && <DokumenteKarte checkliste={dokumente} bezug="GESELLSCHAFT" id={id} t={t} />}

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
                <th className={rechts}>
                  <Begriff k="LTV" t={t} />
                </th>
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
                    <td className={rechts}>
                      <Kennzahl art="verkehrswert" k={hk} t={t} f={f} stichtag={stichtag} ganz ausrichtung="rechts" />
                    </td>
                    <td className={rechts}>
                      <Kennzahl art="restschuld" k={hk} t={t} f={f} stichtag={stichtag} ganz ausrichtung="rechts" />
                    </td>
                    <td className={rechts}>
                      <Kennzahl art="ltv" k={hk} t={t} f={f} stichtag={stichtag} ausrichtung="rechts" />
                    </td>
                    <td className={rechts}>
                      <MieteZelle monat={f.betrag(hk.sollMonat)} jahr={f.betrag(hk.sollJahr)} />
                    </td>
                    <td className={rechts}>
                      <LeerstandZelle quote={f.prozent(hk.leerstandQuote, 1)} nachArt={hk.nachArt} t={t} f={f} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Tabelle>
        )}
      </Karte>

      <Glossar begriffe={["LTV", "DSCR", "JNKM", "Kapitaldienst", "Restschuld", "Covenant", "Ausschuettungssperre", "Headroom", "Zinsbindung", "BAR", "Kaufpreisfaktor", "Leerstand", "EBITDA", "Eigenkapitalquote"]} t={t} />

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

function HausLink({ id, text }: { id: string; text: string }) {
  return (
    <Link href={`/haeuser/${id}`} className="font-medium hover:underline">
      {text}
    </Link>
  );
}
