import Link from "next/link";
import { notFound } from "next/navigation";
import { Formular } from "@/components/formular";
import { Angaben, Karte, Leer, Marke, Seitenkopf } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { erlaubt } from "@/lib/daten/portfolio";
import { formatierer } from "@/lib/format";
import { THEMEN, type Datenpaket, type GeprueftesErgebnis } from "@/lib/ki-analyse";
import { analyseLoeschen } from "../aktionen";
import { ArtMarke, Belege, DatenpaketAnsicht, LueckenListe, zeitpunkt } from "../ki-bausteine";

export default async function AnalyseSeite({ params }: PageProps<"/ki-assistent/[id]">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("kiAssistent");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const tk = t.ki;
  const sicht = await sichtbarkeit(kontext);
  const a = await kontext.db.kiAnalyse.findFirst({
    where: { id, gesellschaftId: erlaubt(sicht.gesellschaftIds) },
    include: { gesellschaft: { select: { id: true, name: true } }, benutzer: { select: { name: true } } },
  });
  if (!a) notFound();
  const paket = a.datenpaket as unknown as Datenpaket;
  const e = a.ergebnis as unknown as GeprueftesErgebnis | null;
  const schreiben = darf(kontext.rolle, "kiAssistent", "schreiben");

  return (
    <div className="max-w-5xl space-y-6">
      <Seitenkopf
        titel={fuelle(tk.ergebnisTitel, { gesellschaft: a.gesellschaft.name })}
        beschreibung={
          <>
            {tk.stichtag} {f.datum(a.stichtag)} ·{" "}
            <Link href={`/gesellschaften/${a.gesellschaft.id}`} className="hover:underline">
              {a.gesellschaft.name}
            </Link>
          </>
        }
        zurueck={{ href: "/ki-assistent", text: tk.titel }}
        aktionen={schreiben && <Formular aktion={analyseLoeschen.bind(null, a.id)} absenden={t.allgemein.loeschen} art="gefahr" bestaetigen={t.allgemein.loeschenBestaetigen} />}
      />

      <Karte>
        <Angaben
          eintraege={[
            [tk.zeitpunkt, zeitpunkt(a.erstelltAm, f.sprache)],
            [tk.benutzer, a.benutzer?.name ?? "–"],
            [tk.modell, a.modell],
            [tk.status, <Marke key="s" ton={a.status === "ERFOLGREICH" ? "gut" : "schlecht"}>{tk.stati[a.status]}</Marke>],
            [tk.schwerpunktKurz, a.schwerpunkt ?? "–"],
            [tk.datenpaket, fuelle(tk.datenpaketZaehlung, { fakten: paket.fakten.length, luecken: paket.luecken.length })],
            ...(a.tokensEingabe !== null ? ([["Token", fuelle(tk.tokens, { ein: f.zahl(a.tokensEingabe), aus: f.zahl(a.tokensAusgabe ?? 0) })]] as Array<[string, string]>) : []),
          ]}
        />
      </Karte>

      {a.status === "FEHLER" && <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{fuelle(tk.fehler, { fehler: a.fehler ?? "–" })}</p>}

      {e && (
        <>
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-medium">{a.modell === tk.demo.modell ? tk.demo.kennzeichnung : tk.kennzeichnung}</p>
            <p>
              {e.pruefung.ohneBeleg + e.pruefung.unbekannteVerweise > 0
                ? fuelle(tk.pruefungHinweis, { ohneBeleg: e.pruefung.ohneBeleg, unbekannt: e.pruefung.unbekannteVerweise })
                : tk.pruefungOk}
            </p>
          </div>

          <Karte titel={tk.zusammenfassung}>
            <p className="whitespace-pre-line text-sm leading-relaxed">{e.zusammenfassung.text}</p>
            <Belege ids={e.zusammenfassung.quellen} unbekannt={e.zusammenfassung.unbekannt} paket={paket} t={t} />
          </Karte>

          <Karte titel={tk.aussagen}>
            {e.aussagen.length === 0 ? (
              <Leer>{tk.keineAussagen}</Leer>
            ) : (
              <div className="space-y-5">
                {THEMEN.filter((th) => e.aussagen.some((x) => x.thema === th)).map((th) => (
                  <div key={th}>
                    <h3 className="mb-2 text-sm font-semibold text-slate-700">{tk.themen[th]}</h3>
                    <ul className="space-y-3">
                      {e.aussagen
                        .filter((x) => x.thema === th)
                        .map((x, i) => (
                          <li key={i} className={`rounded-lg border p-3 text-sm ${x.ohneBeleg ? "border-red-200 bg-red-50" : "border-slate-200"}`}>
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <ArtMarke art={x.art} t={t} />
                              {x.ohneBeleg && <Marke ton="schlecht">{tk.ohneBeleg}</Marke>}
                            </div>
                            <p className="leading-relaxed">{x.text}</p>
                            <Belege ids={x.quellen} unbekannt={x.unbekannt} paket={paket} t={t} />
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Karte>

          <Karte titel={tk.datenluecken}>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-semibold">{tk.lueckenKi}</h3>
                {e.datenluecken.length === 0 ? (
                  <Leer>{tk.keineLuecken}</Leer>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {e.datenluecken.map((l, i) => (
                      <li key={i}>
                        {l.text}
                        <Belege ids={l.quellen} unbekannt={l.unbekannt} paket={paket} t={t} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">{tk.lueckenPaket}</h3>
                <LueckenListe luecken={paket.luecken} t={t} />
              </div>
            </div>
          </Karte>
        </>
      )}

      <Karte titel={tk.datenpaket}>
        <p className="mb-3 text-sm text-slate-600">{fuelle(tk.datenpaketBeschreibung, { stichtag: f.datum(paket.stichtag) })}</p>
        <DatenpaketAnsicht paket={paket} t={t} />
      </Karte>
    </div>
  );
}
