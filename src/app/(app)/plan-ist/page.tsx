import Link from "next/link";
import { Formular } from "@/components/formular";
import { Begriff, Glossar, Unbekannt } from "@/components/herleitung";
import {
  Auswahl,
  Feld,
  Felder,
  Kachel,
  Kacheln,
  Karte,
  Leer,
  Marke,
  Seitenkopf,
  Tabelle,
  rechts,
} from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { bereichsSicht } from "@/lib/auth/auswahl";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { idFilter } from "@/lib/auth/sichtbarkeit";
import { heute } from "@/lib/datum";
import { ladePlanjahre } from "@/lib/daten/plan-ist";
import { formatierer } from "@/lib/format";
import { SCHWELLE_BETRAG, SCHWELLE_PROZENT } from "@/lib/plan-ist";
import { planAnlegen } from "./aktionen";

export default async function PlanIstSeite({
  searchParams,
}: PageProps<"/plan-ist">) {
  const sp = await searchParams;
  const nurGesellschaft =
    typeof sp.gesellschaft === "string" && sp.gesellschaft
      ? sp.gesellschaft
      : undefined;
  const kontext = await pruefeZugriff("gesellschaften");
  const t = texte(kontext.mandant.sprache);
  const tp = t.planIst;
  const f = formatierer(kontext.mandant);
  const schreiben = darf(kontext.rolle, "gesellschaften", "schreiben");
  const sicht = await bereichsSicht(kontext);
  const [plaene, gesellschaften] = await Promise.all([
    ladePlanjahre(kontext, { gesellschaftId: nurGesellschaft }),
    kontext.db.gesellschaft.findMany({
      where: { id: idFilter(sicht.gesellschaftIds) },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const wesentlich = plaene.reduce((n, p) => n + p.ergebnis.wesentlich, 0);
  const ohneErklaerung = plaene.reduce(
    (n, p) => n + p.ergebnis.ohneErklaerung,
    0,
  );
  const ohneIst = plaene.filter((p) => !p.ist).length;

  return (
    <div className="max-w-6xl space-y-6">
      <Seitenkopf
        titel={t.navigation.planIst}
        beschreibung={t.seiten.planIst}
        zurueck={
          nurGesellschaft ? { href: "/plan-ist", text: tp.alle } : undefined
        }
      />
      <Kacheln>
        <Kachel titel={tp.kacheln.plaene} wert={plaene.length} />
        <Kachel titel={tp.kacheln.wesentlich} wert={wesentlich} />
        <Kachel
          titel={tp.kacheln.ohneErklaerung}
          wert={ohneErklaerung}
          ton={ohneErklaerung > 0 ? "warnung" : undefined}
        />
        <Kachel titel={tp.kacheln.ohneIst} wert={ohneIst} />
      </Kacheln>

      <Karte titel={tp.liste}>
        {plaene.length === 0 ? (
          <Leer>{tp.keine}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{tp.spalten.plan}</th>
                <th>{tp.spalten.status}</th>
                <th>{tp.spalten.ist}</th>
                <th className={rechts}>{tp.spalten.ebitdaPlan}</th>
                <th className={rechts}>{tp.spalten.ebitdaIst}</th>
                <th className={rechts}>{tp.spalten.abweichung}</th>
                <th>{tp.kacheln.wesentlich}</th>
              </tr>
            </thead>
            <tbody>
              {plaene.map((p) => {
                const e = p.ergebnis.zeilen.find((z) => z.zeile === "ebitda")!;
                return (
                  <tr key={p.id} data-plan={`${p.gesellschaft} ${p.jahr}`}>
                    <td>
                      <Link
                        href={`/plan-ist/${p.id}`}
                        className="font-medium hover:underline"
                      >
                        {p.gesellschaft}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {tp.jahr} {p.jahr}
                      </div>
                    </td>
                    <td>
                      <Marke
                        ton={p.status === "BESCHLOSSEN" ? "gut" : "neutral"}
                      >
                        {tp.stati[p.status]}
                      </Marke>
                    </td>
                    <td className="text-sm">
                      {p.ist ? (
                        <>
                          {p.ist.quelleText ??
                            t.abschlussQuellen[
                              p.ist.quelle as keyof typeof t.abschlussQuellen
                            ]}{" "}
                          {p.ist.status === "ENTWURF" && (
                            <Marke ton="warnung">
                              {t.abschlussStatus.ENTWURF}
                            </Marke>
                          )}
                        </>
                      ) : (
                        <Unbekannt t={t} />
                      )}
                    </td>
                    <td className={rechts}>
                      {e.plan === null ? (
                        <Unbekannt t={t} />
                      ) : (
                        f.betragGanz(e.plan)
                      )}
                    </td>
                    <td className={rechts}>
                      {e.ist === null ? (
                        <Unbekannt t={t} />
                      ) : (
                        f.betragGanz(e.ist)
                      )}
                    </td>
                    <td className={rechts}>
                      {e.betrag === null ? (
                        <Unbekannt t={t} />
                      ) : (
                        <span
                          className={
                            e.wirkung === "unguenstig"
                              ? "text-rose-700"
                              : e.wirkung === "guenstig"
                                ? "text-emerald-700"
                                : undefined
                          }
                        >
                          {f.betragGanz(e.betrag)}
                          {e.prozent && (
                            <div className="text-xs">
                              {f.prozent(e.prozent, 1)}
                            </div>
                          )}
                        </span>
                      )}
                    </td>
                    <td>
                      {p.ergebnis.wesentlich > 0 ? p.ergebnis.wesentlich : "–"}{" "}
                      {p.ergebnis.ohneErklaerung > 0 && (
                        <Marke ton="warnung">
                          {fuelle(tp.erklaerungFehltAnzahl, {
                            anzahl: p.ergebnis.ohneErklaerung,
                          })}
                        </Marke>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Tabelle>
        )}
      </Karte>

      {schreiben && gesellschaften.length > 0 && (
        <Karte titel={tp.neu}>
          <p className="-mt-2 mb-3 text-sm text-slate-600">{tp.neuHinweis}</p>
          <Formular aktion={planAnlegen} absenden={tp.anlegen}>
            <Felder>
              <Auswahl
                name="gesellschaftId"
                label={tp.gesellschaft}
                wert={nurGesellschaft}
                optionen={gesellschaften.map((g) => ({
                  wert: g.id,
                  text: g.name,
                }))}
                pflicht
              />
              <Feld
                name="jahr"
                label={tp.jahr}
                wert={heute().slice(0, 4)}
                inputMode="numeric"
                pflicht
              />
              <Auswahl
                name="vorlage"
                label={tp.vorlage}
                wert="leer"
                optionen={(["leer", "vorjahrIst", "vorjahrPlan"] as const).map(
                  (v) => ({ wert: v, text: tp.vorlagen[v] }),
                )}
                pflicht
              />
            </Felder>
          </Formular>
        </Karte>
      )}
      <p className="text-xs text-slate-500">
        <Begriff k="WesentlicheAbweichung" t={t} />:{" "}
        {fuelle(tp.schwelle, {
          prozent: f.prozent(SCHWELLE_PROZENT, 0),
          betrag: f.betragGanz(SCHWELLE_BETRAG),
        })}
      </p>
      <Glossar
        begriffe={["PlanIst", "WesentlicheAbweichung", "EBITDA"]}
        t={t}
      />
    </div>
  );
}
