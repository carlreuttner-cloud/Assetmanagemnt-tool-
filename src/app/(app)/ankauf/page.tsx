import type { ReactNode } from "react";
import { Begriff, Glossar, MitHerleitung, Unbekannt, type GlossarBegriff } from "@/components/herleitung";
import { Karte, Leer, Seitenkopf, Tabelle, knopfKlasse, rechts } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { ANKAUF_FELDER, differenz, leseAnkauf, objektKennzahlen, vergleich, VERGLEICH_ZEILEN, type AnkaufFeld, type Vergleich, type VergleichZeile } from "@/lib/ankauf";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { heute } from "@/lib/datum";
import { ladeRechengrundlage } from "@/lib/daten/portfolio";
import { einParam } from "@/lib/filter";
import { formatierer } from "@/lib/format";
import type { Decimal } from "@/lib/geld";
import { gruppenKennzahlen } from "@/lib/kennzahlen";

const GLOSSAR_ZEILE: Partial<Record<VergleichZeile, GlossarBegriff>> = { ltv: "LTV", dscr: "DSCR", icr: "ICR", istJahr: "JNKM", kapitaldienstJahr: "Kapitaldienst" };

export default async function AnkaufSeite({ searchParams }: PageProps<"/ankauf">) {
  const kontext = await pruefeZugriff("szenarien");
  const t = texte(kontext.mandant.sprache);
  const ta = t.ankauf;
  const f = formatierer(kontext.mandant);
  const sp = await searchParams;
  const roh = Object.fromEntries(ANKAUF_FELDER.map((k) => [k, einParam(sp[k]) ?? ""])) as Record<AnkaufFeld, string>;
  const stichtag = heute();
  const grundlage = await ladeRechengrundlage(kontext);
  const gesellschaften = await kontext.db.gesellschaft.findMany({ where: { id: { in: [...new Set([...grundlage.haeuser, ...grundlage.kredite].map((x) => x.gesellschaftId))] } }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const gelesen = leseAnkauf(roh, f.sprache);
  const eingabe = gelesen?.eingabe ?? null;
  const gesellschaft = eingabe ? gesellschaften.find((g) => g.id === eingabe.gesellschaftId) : undefined;

  const bestand = (gid?: string) =>
    gruppenKennzahlen(
      grundlage.haeuser.filter((h) => !gid || h.gesellschaftId === gid),
      grundlage.kredite.filter((k) => !gid || k.gesellschaftId === gid),
      grundlage.referenzwerte,
      stichtag,
    );
  const vergleiche = eingabe && gesellschaft ? { gesellschaft: vergleich(bestand(gesellschaft.id), eingabe, stichtag), portfolio: vergleich(bestand(), eingabe, stichtag) } : null;
  const o = eingabe ? objektKennzahlen(eingabe) : null;

  const feldText = (k: AnkaufFeld) => ta.felder[k];
  const eingabeFeld = (k: Exclude<AnkaufFeld, "gesellschaft">, hinweis?: string) => (
    <label key={k} className="text-sm">
      <span className="block text-slate-700">{k === "nebenkosten" ? <Begriff k="Erwerbsnebenkosten" t={t}>{feldText(k)}</Begriff> : k === "bewirtschaftung" ? <Begriff k="Bewirtschaftungskosten" t={t}>{feldText(k)}</Begriff> : feldText(k)}</span>
      <input name={k} defaultValue={roh[k]} inputMode="decimal" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1" />
      {hinweis && <span className="mt-0.5 block text-xs text-slate-500">{hinweis}</span>}
    </label>
  );

  const zeileWert = (z: VergleichZeile, w: Decimal | null): ReactNode => {
    if (w === null) return <Unbekannt t={t} />;
    if (z === "ltv") return f.prozent(w, 1);
    if (z === "dscr" || z === "icr") return f.faktor(w);
    return f.betragGanz(w);
  };
  const diffWert = (z: VergleichZeile, d: Decimal | null): ReactNode => {
    if (d === null) return <Unbekannt t={t} />;
    const text = z === "ltv" ? fuelle(ta.prozentpunkte, { wert: `${d.isNegative() ? "" : "+"}${f.zahl(d, 1)}` }) : z === "dscr" || z === "icr" ? `${d.isNegative() ? "" : "+"}${f.faktor(d)}` : `${d.isNegative() ? "" : "+"}${f.betragGanz(d)}`;
    const schlecht = z === "ltv" || z === "restschuld" || z === "kapitaldienstJahr" ? d.greaterThan(0) : d.isNegative();
    return <span className={d.isZero() ? undefined : schlecht ? "text-red-700" : "text-emerald-700"}>{text}</span>;
  };
  const stand = (v: Vergleich) => {
    const l = v.vorher.luecken;
    const tage = [l.verkehrswert.von, l.verkehrswert.bis, l.restschuld.von, l.restschuld.bis].filter((d): d is string => !!d).sort();
    return tage.length ? fuelle(ta.stand, { von: f.datum(tage[0]), bis: f.datum(tage[tage.length - 1]) }) : undefined;
  };
  const vergleichTabelle = (titel: string, v: Vergleich, schluessel: string) => (
    <div key={schluessel} data-vergleich={schluessel}>
      <h3 className="mb-1 text-sm font-semibold text-slate-800">{titel}</h3>
      <p className="mb-2 text-xs text-slate-500">{stand(v)}</p>
      <Tabelle>
        <thead>
          <tr>
            <th>{ta.spalten.kennzahl}</th>
            <th className={rechts}>{ta.spalten.vorher}</th>
            <th className={rechts}>{ta.spalten.nachher}</th>
            <th className={rechts}>{ta.spalten.differenz}</th>
          </tr>
        </thead>
        <tbody>
          {VERGLEICH_ZEILEN.map((z) => (
            <tr key={z} data-zeile={z}>
              <td>{GLOSSAR_ZEILE[z] ? <Begriff k={GLOSSAR_ZEILE[z]!} t={t}>{ta.zeilen[z]}</Begriff> : ta.zeilen[z]}</td>
              <td className={rechts}>{zeileWert(z, v.vorher[z])}</td>
              <td className={rechts}>{zeileWert(z, v.nachher[z])}</td>
              <td className={rechts}>{diffWert(z, differenz(v, z))}</td>
            </tr>
          ))}
        </tbody>
      </Tabelle>
    </div>
  );

  const objektZeile = (k: keyof typeof ta.werte, w: Decimal | null, text: (d: Decimal) => string, werte: Array<[ReactNode, ReactNode]>, fehlt?: string, glossar?: GlossarBegriff) => (
    <div key={k} className="flex items-baseline justify-between gap-4 border-b border-slate-100 py-1.5 text-sm" data-objekt={k}>
      <span className="text-slate-600">{glossar ? <Begriff k={glossar} t={t}>{ta.werte[k]}</Begriff> : ta.werte[k]}</span>
      <span className="font-medium">{w === null ? <Unbekannt t={t} grund={fehlt} /> : <MitHerleitung wert={text(w)} herleitung={{ berechnung: ta.herleitung[k], werte }} t={t} ausrichtung="rechts" />}</span>
    </div>
  );

  return (
    <div className="max-w-6xl space-y-6">
      <Seitenkopf titel={t.navigation.ankauf} beschreibung={t.seiten.ankauf} />

      <Karte titel={ta.eingaben}>
        <form method="get" className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="block text-slate-700">{ta.felder.gesellschaft}</span>
              <select name="gesellschaft" defaultValue={roh.gesellschaft} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1">
                <option value="">–</option>
                {gesellschaften.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            {eingabeFeld("kaufpreis")}
            {eingabeFeld("nebenkosten")}
            {eingabeFeld("wert", ta.felder.wertHinweis)}
            {eingabeFeld("miete")}
            {eingabeFeld("bewirtschaftung")}
            {eingabeFeld("darlehen")}
            {eingabeFeld("zins")}
            {eingabeFeld("tilgung")}
          </div>
          <button type="submit" className={knopfKlasse("primaer")}>
            {ta.berechnen}
          </button>
        </form>
        <p className="mt-3 text-sm text-slate-600">{ta.hinweis}</p>
        {gelesen && gelesen.fehler.length > 0 && (
          <ul className="mt-3 list-disc pl-5 text-sm text-red-700" data-fehler>
            {gelesen.fehler.map((x) => (
              <li key={x.feld}>{fuelle(ta.fehler[x.art], { feld: feldText(x.feld) })}</li>
            ))}
          </ul>
        )}
      </Karte>

      {!gelesen ? (
        <Leer>{ta.leer}</Leer>
      ) : eingabe && !gesellschaft ? (
        <Leer>{ta.keineGesellschaft}</Leer>
      ) : eingabe && o && vergleiche ? (
        <>
          <Karte titel={ta.objekt}>
            <div className="grid grid-cols-1 gap-x-10 md:grid-cols-2">
              <div>
                {objektZeile("jahresmiete", o.jahresmiete, f.betragGanz, [[ta.felder.miete, f.betrag(eingabe.mieteMonat)]], undefined, "JNKM")}
                {objektZeile("nebenkosten", o.nebenkosten, f.betragGanz, [[ta.felder.kaufpreis, f.betragGanz(eingabe.kaufpreis)]], ta.fehltNebenkosten, "Erwerbsnebenkosten")}
                {objektZeile("gesamtinvestition", o.gesamtinvestition, f.betragGanz, [], ta.fehltNebenkosten)}
                {objektZeile("eigenkapital", o.eigenkapital, f.betragGanz, [[ta.felder.darlehen, f.betragGanz(eingabe.darlehen)]], ta.fehltNebenkosten)}
                {objektZeile("zinsen", o.zinsenJahr, f.betragGanz, [[ta.felder.zins, f.prozent(eingabe.zins, 2)]])}
                {objektZeile("kapitaldienst", o.kapitaldienstJahr, f.betragGanz, [[ta.felder.zins, f.prozent(eingabe.zins, 2)], [ta.felder.tilgung, f.prozent(eingabe.tilgung, 2)]], undefined, "Kapitaldienst")}
                {objektZeile("reinertrag", o.reinertrag, f.betragGanz, [], ta.fehltBewirtschaftung, "Reinertrag")}
                {objektZeile("cashflow", o.cashflow, f.betragGanz, [], ta.fehltBewirtschaftung)}
              </div>
              <div>
                {objektZeile("bar", o.bruttoanfangsrendite, (d) => f.prozent(d, 2), [[ta.werte.jahresmiete, f.betragGanz(o.jahresmiete)], [ta.felder.kaufpreis, f.betragGanz(eingabe.kaufpreis)]], undefined, "BAR")}
                {objektZeile("faktor", o.kaufpreisfaktor, (d) => f.faktor(d, 1), [], undefined, "Kaufpreisfaktor")}
                {objektZeile("nar", o.nettoanfangsrendite, (d) => f.prozent(d, 2), [], o.gesamtinvestition === null ? ta.fehltNebenkosten : ta.fehltBewirtschaftung, "NettoAnfangsrendite")}
                {objektZeile("ltv", o.ltv, (d) => f.prozent(d, 1), [[ta.felder.darlehen, f.betragGanz(eingabe.darlehen)], [ta.felder.wert, f.betragGanz(eingabe.wert)]], undefined, "LTV")}
                {objektZeile("dscr", o.dscr, (d) => f.faktor(d), [[ta.werte.jahresmiete, f.betragGanz(o.jahresmiete)], [ta.werte.kapitaldienst, f.betragGanz(o.kapitaldienstJahr)]], undefined, "DSCR")}
                {objektZeile("icr", o.icr, (d) => f.faktor(d), [[ta.werte.jahresmiete, f.betragGanz(o.jahresmiete)], [ta.werte.zinsen, f.betragGanz(o.zinsenJahr)]], undefined, "ICR")}
                {objektZeile("coc", o.cashOnCash, (d) => f.prozent(d, 2), [], o.eigenkapital === null ? ta.fehltNebenkosten : ta.fehltBewirtschaftung, "CashOnCash")}
              </div>
            </div>
          </Karte>

          <Karte titel={ta.auswirkung}>
            <p className="-mt-2 mb-4 text-xs text-slate-500">{ta.auswirkungHinweis}</p>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {vergleichTabelle(`${ta.gesellschaft}: ${gesellschaft!.name}`, vergleiche.gesellschaft, "gesellschaft")}
              {vergleichTabelle(ta.portfolio, vergleiche.portfolio, "portfolio")}
            </div>
          </Karte>
        </>
      ) : null}

      <Glossar begriffe={["BAR", "Kaufpreisfaktor", "NettoAnfangsrendite", "CashOnCash", "Erwerbsnebenkosten", "Bewirtschaftungskosten", "Reinertrag", "LTV", "DSCR", "ICR", "JNKM", "Kapitaldienst"]} t={t} />
    </div>
  );
}
