import { cookies } from "next/headers";
import { Suspense } from "react";
import { abmelden, mandantWechseln, portfolioWaehlen } from "@/app/aktionen";
import { ExportLeiste } from "@/components/export-leiste";
import { GlobaleSuche } from "@/components/globale-suche";
import { Merkliste } from "@/components/lesezeichen";
import { PortfolioAuswahl } from "@/components/portfolio-auswahl";
import { QuellenSchalter } from "@/components/quellen-schalter";
import { Sprungziel } from "@/components/sprungziel";
import { Reiterzeile, SeitenleistenNavigation, type NavGruppeMitText } from "@/components/seitenleiste";
import { fuelle, texte } from "@/i18n";
import { AUSWAHL_OHNE, ladeAuswahl } from "@/lib/auth/auswahl";
import { getKontext } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { formatDatum, heute } from "@/lib/datum";
import { erlaubteNavigation } from "@/lib/navigation";
import { QUELLEN_COOKIE } from "@/lib/quellen";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const kontext = await getKontext();
  const t = texte(kontext.mandant.sprache);
  const gruppen: NavGruppeMitText[] = erlaubteNavigation((b) => darf(kontext.rolle, b)).map((g) => ({
    ...g,
    text: t.navigationGruppen[g.schluessel],
    reiterTexte: Object.fromEntries(g.reiter.map((r) => [r.pfad, t.navigation[r.textSchluessel]])),
  }));

  // Portfolio-Auswahl nur für Rollen, die Gesellschaften sehen; nur Portfolios mit sichtbaren Gesellschaften.
  const mitAuswahl = darf(kontext.rolle, "gesellschaften");
  const [auswahl, sicht] = mitAuswahl ? await Promise.all([ladeAuswahl(kontext), sichtbarkeit(kontext)]) : [null, null];
  const portfolios = mitAuswahl
    ? await kontext.db.portfolio.findMany({
        where: sicht && sicht.gesellschaftIds !== "alle" ? { gesellschaften: { some: { id: { in: sicht.gesellschaftIds } } } } : undefined,
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];
  const quellenAn = (await cookies()).get(QUELLEN_COOKIE)?.value === "an";
  const auswahlWert = auswahl?.art === "portfolio" ? auswahl.id : auswahl?.art === "ohne" ? AUSWAHL_OHNE : "";
  const auswahlName = auswahl?.art === "portfolio" ? auswahl.name : auswahl?.art === "ohne" ? t.auswahl.ohne : null;

  return (
    <div className="flex min-h-screen">
      {/* Volle Fensterhöhe, bleibt beim Scrollen stehen. Nur der mittlere Teil scrollt; Suche und Konto bleiben unten. */}
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col bg-slate-900 text-white">
        <div className="shrink-0 px-7 pb-4 pt-4">
          <div className="text-sm font-semibold">{t.app.titel}</div>
          <div className="mt-1 text-xs text-slate-400">{kontext.mandant.name}</div>
        </div>

        <div data-seitenleiste-mitte className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {mitAuswahl && (
          <div className="mb-5 px-3">
            <Suspense>
              <PortfolioAuswahl
                key={auswahlWert}
                aktion={portfolioWaehlen}
                wert={auswahlWert}
                label={t.auswahl.titel}
                optionen={[
                  { wert: "", text: t.auswahl.alle },
                  ...portfolios.map((p) => ({ wert: p.id, text: p.name })),
                  { wert: AUSWAHL_OHNE, text: t.auswahl.ohne },
                ]}
              />
            </Suspense>
          </div>
        )}

        <SeitenleistenNavigation gruppen={gruppen} />
        {darf(kontext.rolle, "suche") && (
          <Merkliste texte={{ favoriten: t.lesezeichen.favoriten, zuletzt: t.lesezeichen.zuletzt, keineFavoriten: t.lesezeichen.keineFavoriten }} />
        )}
        </div>

        <div data-seitenleiste-unten className="shrink-0 space-y-3 border-t border-slate-800 px-7 pb-4 pt-4 text-xs text-slate-400">
          {darf(kontext.rolle, "suche") && (
            <GlobaleSuche
              texte={{
                platzhalter: t.suche.platzhalter,
                kuerzel: t.suche.kuerzel,
                label: t.suche.label,
                alleAnzeigen: t.suche.alleAnzeigen,
                laeuft: t.suche.laeuft,
                keineTreffer: t.suche.keineTreffer,
                arten: t.suche.arten,
              }}
            />
          )}
          {kontext.mandanten.length > 1 && (
            <form action={mandantWechseln} className="space-y-1">
              <label htmlFor="mandantId" className="block">{t.konto.mandant}</label>
              <div className="flex gap-1">
                <select
                  id="mandantId"
                  name="mandantId"
                  defaultValue={kontext.mandant.id}
                  className="min-w-0 flex-1 rounded bg-slate-800 px-2 py-1 text-slate-100"
                >
                  {kontext.mandanten.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <button className="rounded bg-slate-700 px-2 py-1 text-slate-100 hover:bg-slate-600">OK</button>
              </div>
            </form>
          )}
          <div>
            <div className="text-slate-200">{kontext.benutzer.name}</div>
            <div>{t.rollen[kontext.rolle]}</div>
          </div>
          <form action={abmelden}>
            <button className="hover:text-white">{t.konto.abmelden}</button>
          </form>
        </div>
      </aside>

      <main id="inhalt" data-quellen={quellenAn ? "an" : "aus"} className="min-w-0 flex-1 p-8">
        <div className="flex flex-wrap items-start gap-x-4">
          <div className="min-w-0 flex-1">
            <Reiterzeile gruppen={gruppen} />
          </div>
          <div className="mb-4 ml-auto flex flex-wrap items-center gap-2" data-nicht-drucken>
            <ExportLeiste
              texte={{
                excel: t.export.excel,
                pdf: t.export.pdf,
                excelTitel: t.export.excelTitel,
                pdfTitel: t.export.pdfTitel,
                laeuft: t.export.laeuft,
                info: t.export.info,
                ansicht: t.export.ansicht,
                adresse: t.export.adresse,
                exportiertAm: t.export.exportiertAm,
                hinweis: t.export.hinweis,
                kennzahlen: t.export.kennzahlen,
                titel: t.export.titel,
                wert: t.export.wert,
                zusatz: t.export.zusatz,
                quellen: t.export.quellen,
                monat: t.allgemein.monat,
                jahr: t.allgemein.jahr,
                glossar: Object.fromEntries(
                  Object.entries(t.glossar)
                    .filter(([k]) => k !== "titel")
                    .map(([, v]) => [(v as { kurz: string }).kurz, (v as { lang: string }).lang]),
                ),
                auswahl: { ...t.exportAuswahl, regeln: { ...t.exportAuswahl.regeln } },
              }}
              ki={{ erlaubt: darf(kontext.rolle, "kiAssistent") }}
            />
            <QuellenSchalter an={quellenAn} texte={{ schalter: t.quellen.schalter, an: t.quellen.an, aus: t.quellen.aus, hinweis: t.quellen.hinweis }} />
          </div>
        </div>
        <div className="druckkopf mb-4 border-b border-slate-300 pb-2 text-xs text-slate-600">
          {fuelle(t.export.druckkopf, { datum: formatDatum(heute(), kontext.mandant.sprache), mandant: kontext.mandant.name })}{" "}
          <span data-ansicht>{auswahlName ?? t.auswahl.alle}</span>
        </div>
        {auswahlName && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-sky-50 px-4 py-2 text-sm text-sky-900">
            <span>{fuelle(t.auswahl.hinweis, { name: auswahlName })}</span>
            <form action={portfolioWaehlen}>
              <input type="hidden" name="portfolio" value="" />
              <input type="hidden" name="zurueck" value="/" />
              <button className="font-medium underline">{t.auswahl.zuruecksetzen}</button>
            </form>
          </div>
        )}
        {children}
        <Sprungziel />
      </main>
    </div>
  );
}
