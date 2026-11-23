import Link from "next/link";
import { KnopfLink, Leer, MieteZelle, Seitenkopf, Tabelle, rechts } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { idFilter } from "@/lib/auth/sichtbarkeit";
import { heute } from "@/lib/datum";
import { ladeRechengrundlage } from "@/lib/daten/portfolio";
import { formatierer } from "@/lib/format";
import { gruppenKennzahlen } from "@/lib/kennzahlen";

export default async function GesellschaftenSeite() {
  const kontext = await pruefeZugriff("gesellschaften");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const stichtag = heute();
  const { haeuser, kredite, referenzwerte, sicht } = await ladeRechengrundlage(kontext);
  const gesellschaften = await kontext.db.gesellschaft.findMany({
    where: { id: idFilter(sicht.gesellschaftIds) },
    orderBy: { name: "asc" },
  });
  const zeilen = gesellschaften.map((g) => ({
    g,
    k: gruppenKennzahlen(
      haeuser.filter((h) => h.gesellschaftId === g.id),
      kredite.filter((x) => x.gesellschaftId === g.id),
      referenzwerte,
      stichtag,
    ),
    kredite: kredite.filter((x) => x.gesellschaftId === g.id).length,
  }));
  const gesamt = gruppenKennzahlen(haeuser, kredite, referenzwerte, stichtag);
  const schreiben = darf(kontext.rolle, "gesellschaften", "schreiben");

  return (
    <div>
      <Seitenkopf
        titel={t.gesellschaften.titel}
        beschreibung={t.seiten.gesellschaften}
        aktionen={
          <>
            <KnopfLink href="/gesellschaften/referenzzinsen">{t.gesellschaften.referenzzinsen}</KnopfLink>
            {schreiben && (
              <KnopfLink href="/gesellschaften/neu" art="primaer">
                {t.gesellschaften.neu}
              </KnopfLink>
            )}
          </>
        }
      />
      <div className="rounded-xl border border-slate-200 bg-white">
        {zeilen.length === 0 ? (
          <div className="px-5">
            <Leer>{t.allgemein.keineDaten}</Leer>
          </div>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{t.gesellschaften.name}</th>
                <th className={rechts}>{t.kennzahlen.haeuser}</th>
                <th className={rechts}>{t.kennzahlen.kredite}</th>
                <th className={rechts}>{t.kennzahlen.verkehrswert}</th>
                <th className={rechts}>{t.kennzahlen.restschuld}</th>
                <th className={rechts}>{t.kennzahlen.ltv}</th>
                <th className={rechts}>
                  {t.kennzahlen.sollMiete} ({t.allgemein.monat} / {t.allgemein.jahr})
                </th>
                <th className={rechts}>{t.kennzahlen.leerstand}</th>
                <th className={rechts}>{t.kennzahlen.dscr}</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map(({ g, k, kredite: anzahlKredite }) => (
                <tr key={g.id} className="hover:bg-slate-50">
                  <td>
                    <Link href={`/gesellschaften/${g.id}`} className="font-medium text-slate-900 hover:underline">
                      {g.name}
                    </Link>
                    {g.rechtsform && <div className="text-xs text-slate-500">{g.rechtsform}</div>}
                  </td>
                  <td className={rechts}>{k.haeuser}</td>
                  <td className={rechts}>{anzahlKredite}</td>
                  <td className={rechts}>{f.betragGanz(k.verkehrswert)}</td>
                  <td className={rechts}>{f.betragGanz(k.restschuld)}</td>
                  <td className={rechts}>{f.prozent(k.ltv, 1)}</td>
                  <td className={rechts}>
                    <MieteZelle monat={f.betrag(k.sollMonat)} jahr={f.betrag(k.sollJahr)} />
                  </td>
                  <td className={rechts}>{f.prozent(k.leerstandQuote, 1)}</td>
                  <td className={rechts}>{f.faktor(k.dscr)}</td>
                </tr>
              ))}
            </tbody>
            {zeilen.length > 1 && (
              <tfoot>
                <tr>
                  <td>{t.gesellschaften.summePortfolio}</td>
                  <td className={rechts}>{gesamt.haeuser}</td>
                  <td className={rechts}>{kredite.length}</td>
                  <td className={rechts}>{f.betragGanz(gesamt.verkehrswert)}</td>
                  <td className={rechts}>{f.betragGanz(gesamt.restschuld)}</td>
                  <td className={rechts}>{f.prozent(gesamt.ltv, 1)}</td>
                  <td className={rechts}>
                    <MieteZelle monat={f.betrag(gesamt.sollMonat)} jahr={f.betrag(gesamt.sollJahr)} />
                  </td>
                  <td className={rechts}>{f.prozent(gesamt.leerstandQuote, 1)}</td>
                  <td className={rechts}>{f.faktor(gesamt.dscr)}</td>
                </tr>
              </tfoot>
            )}
          </Tabelle>
        )}
      </div>
    </div>
  );
}
