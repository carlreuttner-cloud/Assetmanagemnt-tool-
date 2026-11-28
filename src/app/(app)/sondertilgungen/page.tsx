import Link from "next/link";
import { Begriff, Glossar, MitHerleitung, Unbekannt } from "@/components/herleitung";
import { Kachel, Kacheln, Karte, Leer, Marke, Seitenkopf, Tabelle, rechts } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { heute } from "@/lib/datum";
import { ladeRechengrundlage } from "@/lib/daten/portfolio";
import { SONDERTILGUNG_FELDER, sondertilgungAusDb } from "@/lib/daten/sondertilgung";
import { formatierer } from "@/lib/format";
import { dezimal } from "@/lib/geld";
import { laufendesJahr, sondertilgung, sondertilgungRegel } from "@/lib/sondertilgung";

export default async function SondertilgungenSeite() {
  const kontext = await pruefeZugriff("gesellschaften");
  const t = texte(kontext.mandant.sprache);
  const ts = t.sondertilgung;
  const f = formatierer(kontext.mandant);
  const stichtag = heute();
  const grundlage = await ladeRechengrundlage(kontext);
  const kredite = await kontext.db.kredit.findMany({
    where: { id: { in: grundlage.kredite.map((k) => k.id) } },
    orderBy: [{ gesellschaft: { name: "asc" } }, { bezeichnung: "asc" }],
    select: { id: true, bezeichnung: true, bank: true, gesellschaft: { select: { name: true } }, ...SONDERTILGUNG_FELDER },
  });
  const zeilen = kredite.map((k) => {
    const eingabe = sondertilgungAusDb(k);
    const erg = sondertilgung(eingabe, stichtag);
    return { k, eingabe, erg, jahr: laufendesJahr(erg) };
  });
  const laufend = zeilen.filter((z) => z.jahr);
  const summe = (w: (z: (typeof laufend)[number]) => ReturnType<typeof dezimal>) => laufend.reduce((s, z) => s.plus(w(z)), dezimal(0));
  const unbekannt = zeilen.filter((z) => z.erg.art === "unbekannt");
  const unvollstaendig = unbekannt.length > 0 ? fuelle(ts.unvollstaendig, { anzahl: unbekannt.length }) : undefined;

  return (
    <div className="max-w-7xl space-y-6">
      <Seitenkopf titel={t.navigation.sondertilgungen} beschreibung={t.seiten.sondertilgungen} />
      {zeilen.length === 0 ? (
        <Leer>{ts.keine}</Leer>
      ) : (
        <>
          <Kacheln>
            <Kachel titel={ts.kacheln.offen} wert={f.betragGanz(summe((z) => z.jahr!.offen))} unter={unvollstaendig ?? fuelle(ts.kredite, { anzahl: laufend.length })} ton={unvollstaendig ? "warnung" : undefined} />
            <Kachel titel={ts.kacheln.genutzt} wert={f.betragGanz(summe((z) => z.jahr!.genutzt))} unter={ts.quelle} />
            <Kachel titel={<Begriff k="Sondertilgungsrecht" t={t}>{ts.kacheln.kredite}</Begriff>} wert={laufend.length} unter={fuelle(ts.kredite, { anzahl: zeilen.length })} />
            <Kachel titel={ts.kacheln.unbekannt} wert={unbekannt.length} ton={unbekannt.length > 0 ? "warnung" : undefined} />
          </Kacheln>

          <Karte titel={ts.jeKredit}>
            <Tabelle>
              <thead>
                <tr>
                  <th>{ts.spaltenListe.kredit}</th>
                  <th>{ts.spaltenListe.regel}</th>
                  <th>{ts.spaltenListe.zeitraum}</th>
                  <th className={rechts}>{ts.spaltenListe.erlaubt}</th>
                  <th className={rechts}>{ts.spaltenListe.genutzt}</th>
                  <th className={rechts}>{ts.spaltenListe.offen}</th>
                </tr>
              </thead>
              <tbody>
                {zeilen.map(({ k, eingabe, erg, jahr }) => (
                  <tr key={k.id} data-st-kredit={k.bezeichnung}>
                    <td>
                      <Link href={`/gesellschaften/kredite/${k.id}#sondertilgung`} className="font-medium hover:underline">
                        {k.bezeichnung}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {k.gesellschaft.name}
                        {k.bank ? ` · ${k.bank}` : ""}
                      </div>
                    </td>
                    <td className="max-w-xs text-sm">
                      {erg.art === "unbekannt" ? <span className="text-amber-700">{ts.unbekannt[erg.grund]}</span> : sondertilgungRegel(eingabe, ts, f)}
                    </td>
                    <td className="whitespace-nowrap text-sm">
                      {jahr ? (
                        <>
                          {f.datum(jahr.von)} – {f.datum(jahr.bis)}
                          {jahr.offen.greaterThan(0) && (
                            <div>
                              <Marke ton="gut">{t.fristen.arten.sondertilgung} {f.datum(jahr.bis)}</Marke>
                            </div>
                          )}
                        </>
                      ) : erg.art === "recht" ? (
                        <span className="text-slate-500">{ts.keinLaufendes}</span>
                      ) : (
                        "–"
                      )}
                    </td>
                    <td className={rechts}>{jahr ? f.betragGanz(jahr.erlaubt.plus(jahr.uebertrag)) : erg.art === "unbekannt" ? <Unbekannt t={t} /> : "–"}</td>
                    <td className={rechts}>
                      {jahr ? (
                        <MitHerleitung wert={f.betragGanz(jahr.genutzt)} herleitung={{ berechnung: ts.quelle, werte: [[ts.spalten.buchungen, String(jahr.buchungen)]] }} t={t} ausrichtung="rechts" />
                      ) : erg.art !== "recht" && erg.genutzt.greaterThan(0) ? (
                        f.betragGanz(erg.genutzt)
                      ) : (
                        "–"
                      )}
                    </td>
                    <td className={rechts}>
                      {jahr ? (
                        <MitHerleitung
                          wert={<span className={jahr.offen.greaterThan(0) ? "font-medium text-emerald-700" : undefined}>{f.betragGanz(jahr.offen)}</span>}
                          herleitung={{ berechnung: ts.herleitungOffen, werte: [[ts.spalten.erlaubt, f.betragGanz(jahr.erlaubt)], [ts.spalten.uebertrag, f.betragGanz(jahr.uebertrag)], [ts.spalten.genutzt, f.betragGanz(jahr.genutzt)]], hinweis: jahr.ueberschritten.greaterThan(0) ? fuelle(ts.ueberschritten, { betrag: f.betragGanz(jahr.ueberschritten) }) : undefined }}
                          t={t}
                          ausrichtung="rechts"
                        />
                      ) : erg.art === "unbekannt" ? (
                        <Unbekannt t={t} grund={ts.unbekannt[erg.grund]} />
                      ) : (
                        "–"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabelle>
          </Karte>
        </>
      )}
      <Glossar begriffe={["Sondertilgungsrecht", "Zinsbindung"]} t={t} />
    </div>
  );
}
