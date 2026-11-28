import Link from "next/link";
import { Jahressaeulen } from "@/components/diagramme";
import { Begriff, Glossar, RestschuldWert, Unbekannt, ZinssatzWert } from "@/components/herleitung";
import { Kachel, Kacheln, Karte, Leer, Marke, Seitenkopf, Tabelle, rechts, type Ton } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { heute } from "@/lib/datum";
import { ladeCheckliste } from "@/lib/daten/dokumente";
import { ladeRechengrundlage } from "@/lib/daten/portfolio";
import { formatierer } from "@/lib/format";
import { dezimal } from "@/lib/geld";
import { maturityWall, refinanzierungsFaelle, type Phase } from "@/lib/refinanzierung";
import { unterlagenStand } from "./unterlagen";

const PHASE_TON: Record<Phase, Ton> = { ueberfaellig: "schlecht", dringend: "schlecht", vorbereiten: "warnung", spaeter: "neutral" };

export default async function RefinanzierungSeite() {
  const kontext = await pruefeZugriff("gesellschaften");
  const t = texte(kontext.mandant.sprache);
  const tr = t.refinanzierung;
  const f = formatierer(kontext.mandant);
  const stichtag = heute();
  const grundlage = await ladeRechengrundlage(kontext);
  const faelle = refinanzierungsFaelle(grundlage.kredite, stichtag);
  const wand = maturityWall(grundlage.kredite, stichtag);
  const [kredite, checkliste] = await Promise.all([
    kontext.db.kredit.findMany({ where: { id: { in: grundlage.kredite.map((k) => k.id) } }, select: { id: true, bezeichnung: true, bank: true, gesellschaft: { select: { name: true } } } }),
    darf(kontext.rolle, "dokumente") ? ladeCheckliste(kontext) : null,
  ]);
  const kredit = new Map(kredite.map((k) => [k.id, k]));
  const daten = new Map(grundlage.kredite.map((k) => [k.id, k]));

  const summe = (liste: typeof faelle) => liste.reduce((s, x) => (x.nachweis && x.nachweis.herkunft !== "nichtAusgezahlt" ? s.plus(x.nachweis.betrag) : s), dezimal(0));
  const ohneBeleg = (liste: typeof faelle) => liste.filter((x) => !x.nachweis).length;
  const dringend = faelle.filter((x) => x.phase === "dringend");
  const ueber = faelle.filter((x) => x.phase === "ueberfaellig");
  const unterlagen = new Map(faelle.map((x) => [x.kreditId, checkliste ? unterlagenStand(checkliste, daten.get(x.kreditId)!, grundlage.haeuser) : null]));
  const offenGesamt = [...unterlagen.values()].reduce((s, u) => s + (u?.zaehlung.offen ?? 0), 0);
  const unter = (liste: typeof faelle) => (
    <>
      {fuelle(tr.summeUnter, { betrag: f.betragGanz(summe(liste)) })}
      {ohneBeleg(liste) > 0 && <div className="text-amber-700">{fuelle(tr.unvollstaendig, { anzahl: ohneBeleg(liste) })}</div>}
    </>
  );
  const jahrText = (j: string) => (j in tr.jahre ? tr.jahre[j as keyof typeof tr.jahre] : j);
  const kalender = wand.filter((w) => /^\d{4}$/.test(w.jahr));

  return (
    <div className="max-w-7xl space-y-6">
      <Seitenkopf titel={t.navigation.refinanzierung} beschreibung={t.seiten.refinanzierung} />

      <Kacheln>
        <Kachel titel={tr.kacheln.faellig24} wert={faelle.filter((x) => x.phase !== "ueberfaellig").length} unter={unter(faelle.filter((x) => x.phase !== "ueberfaellig"))} />
        <Kachel titel={tr.kacheln.dringend} wert={dringend.length} unter={unter(dringend)} ton={dringend.length > 0 ? "warnung" : undefined} />
        <Kachel titel={tr.kacheln.ueberfaellig} wert={ueber.length} unter={unter(ueber)} ton={ueber.length > 0 ? "schlecht" : undefined} />
        {checkliste && <Kachel titel={tr.kacheln.unterlagen} wert={offenGesamt} ton={offenGesamt > 0 ? "warnung" : "gut"} />}
      </Kacheln>

      <Karte titel={<Begriff k="MaturityWall" t={t}>{tr.wand}</Begriff>}>
        <p className="mb-3 text-sm text-slate-600">{tr.wandHinweis}</p>
        <Jahressaeulen
          jahre={kalender.map((w) => ({ jahr: Number(w.jahr), wert: w.restschuld, entwurf: w.ohneBeleg > 0, titel: `${w.anzahl} · ${fuelle(tr.unvollstaendig, { anzahl: w.ohneBeleg })}` }))}
          format={(w) => f.betragGanz(w)}
          formatKurz={(w) => f.betragKurz(w)}
          legende={tr.legende}
        />
        <div className="mt-4">
          <Tabelle>
            <thead>
              <tr>
                <th>{tr.spaltenWand.jahr}</th>
                <th className={rechts}>{tr.spaltenWand.anzahl}</th>
                <th className={rechts}>{tr.spaltenWand.zinsbindung}</th>
                <th className={rechts}>{tr.spaltenWand.kreditende}</th>
                <th className={rechts}>{tr.spaltenWand.restschuld}</th>
              </tr>
            </thead>
            <tbody>
              {wand
                .filter((w) => w.anzahl > 0)
                .map((w) => (
                  <tr key={w.jahr} data-wand={w.jahr}>
                    <td>{jahrText(w.jahr)}</td>
                    <td className={rechts}>{w.anzahl}</td>
                    <td className={rechts}>{w.zinsbindung}</td>
                    <td className={rechts}>{w.kreditende}</td>
                    <td className={rechts}>
                      {f.betragGanz(w.restschuld)}
                      {w.ohneBeleg > 0 && <div className="text-xs text-amber-700">{fuelle(tr.unvollstaendig, { anzahl: w.ohneBeleg })}</div>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </Tabelle>
        </div>
      </Karte>

      <Karte titel={<Begriff k="Refinanzierung" t={t}>{tr.faelle}</Begriff>}>
        <p className="mb-3 text-sm text-slate-600">{tr.faelleHinweis}</p>
        {faelle.length === 0 ? (
          <Leer>{tr.keineFaelle}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{tr.spalten.kredit}</th>
                <th>{tr.spalten.ereignis}</th>
                <th>{tr.spalten.datum}</th>
                <th className={rechts}>{tr.spalten.monate}</th>
                <th>{tr.spalten.phase}</th>
                <th className={rechts}>{tr.spalten.restschuld}</th>
                <th className={rechts}>{tr.spalten.zinssatz}</th>
                {checkliste && <th>{tr.spalten.unterlagen}</th>}
              </tr>
            </thead>
            <tbody>
              {faelle.map((x) => {
                const k = kredit.get(x.kreditId);
                const u = unterlagen.get(x.kreditId);
                return (
                  <tr key={x.kreditId} data-fall={x.phase}>
                    <td>
                      <Link href={`/refinanzierung/${x.kreditId}`} className="font-medium hover:underline">
                        {k?.bezeichnung}
                      </Link>
                      <div className="text-xs text-slate-500">{[k?.gesellschaft.name, k?.bank].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td>{tr.ereignisse[x.ereignis.art]}</td>
                    <td>{f.datum(x.ereignis.datum)}</td>
                    <td className={rechts}>{fuelle(tr.monateWert, { monate: x.monate })}</td>
                    <td>
                      <Marke ton={PHASE_TON[x.phase]}>{tr.phasen[x.phase]}</Marke>
                    </td>
                    <td className={rechts}>{<RestschuldWert nachweis={x.nachweis} t={t} f={f} ganz />}</td>
                    <td className={rechts}>{<ZinssatzWert k={daten.get(x.kreditId)!} referenzwerte={grundlage.referenzwerte} stichtag={stichtag} t={t} f={f} />}</td>
                    {checkliste && (
                      <td className="text-sm">
                        {!u || u.zaehlung.gesamt === 0 ? (
                          <span className="text-slate-400">{tr.keineVorgaben}</span>
                        ) : (
                          <Link href={`/refinanzierung/${x.kreditId}`} className={u.zaehlung.offen > 0 ? "text-amber-700 hover:underline" : "text-emerald-700 hover:underline"}>
                            {fuelle(tr.unterlagenWert, { offen: u.zaehlung.offen, gesamt: u.zaehlung.gesamt })}
                          </Link>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Tabelle>
        )}
        {faelle.some((x) => !x.nachweis) && (
          <p className="mt-2 text-xs text-slate-500">
            <Unbekannt t={t} /> = {t.herleitung.restschuldUnbekannt}
          </p>
        )}
      </Karte>

      <Glossar begriffe={["MaturityWall", "Refinanzierung", "Zinsbindung", "Restschuld"]} t={t} />
    </div>
  );
}
