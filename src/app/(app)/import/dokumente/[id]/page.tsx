import Link from "next/link";
import { notFound } from "next/navigation";
import { Formular } from "@/components/formular";
import { Angaben, Karte, KnopfLink, Leer, Marke, Seitenkopf, knopfKlasse } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { isoDatum } from "@/lib/datum";
import { dokumentFilter, ladeZuordnungsKandidaten } from "@/lib/daten/dateien";
import { MAX_OCR_SEITEN } from "@/lib/dokument-text";
import { erkenneDatum, erkenneJahr, erkenneKategorie, erkenneObjekt, jahrbezogen, markiere, ueblicheZuordnung } from "@/lib/dokument-vorschlag";
import { einParam } from "@/lib/filter";
import { formatierer } from "@/lib/format";
import { dokumentBestaetigen, dokumentLoeschen, textNeuErkennen } from "../aktionen";
import { BestaetigenFormular } from "./bestaetigen-formular";
import { ZurFundstelle } from "./zur-fundstelle";

export default async function DokumentSeite({ params, searchParams }: PageProps<"/import/dokumente/[id]">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("dokumente");
  const t = texte(kontext.mandant.sprache);
  const td = t.dateien;
  const f = formatierer(kontext.mandant);
  const sp = await searchParams;
  const schreiben = darf(kontext.rolle, "dokumente", "schreiben");

  const d = await kontext.db.dokument.findFirst({
    where: { id, ...dokumentFilter(await sichtbarkeit(kontext)) },
    include: {
      seiten: { orderBy: { nummer: "asc" }, select: { nummer: true, text: true } },
      gesellschaft: { select: { id: true, name: true } },
      haus: { select: { id: true, bezeichnung: true } },
      kredit: { select: { id: true, bezeichnung: true, gesellschaftId: true } },
      hochgeladenVon: { select: { name: true } },
    },
  });
  if (!d) notFound();

  const begriff = (einParam(sp.q) ?? "").trim().slice(0, 100);
  const bearbeiten = schreiben && (!d.bestaetigt || einParam(sp.bearbeiten) === "1");

  // Fundstellen im ganzen Dokument: je Seite die Anzahl, global durchnummeriert
  const fundstellen: Array<{ seite: number; n: number }> = [];
  if (begriff.length >= 2) {
    for (const s of d.seiten) {
      const anzahl = markiere(s.text, begriff).filter((x) => x.treffer).length;
      for (let n = 0; n < anzahl; n++) fundstellen.push({ seite: s.nummer, n });
    }
  }
  const seiteParam = Number(einParam(sp.seite));
  const nParam = Number(einParam(sp.n) ?? 0);
  const seite = d.seiten.some((s) => s.nummer === seiteParam) ? seiteParam : (fundstellen[0]?.seite ?? d.seiten[0]?.nummer ?? 1);
  const aktuell = Math.max(
    0,
    fundstellen.findIndex((x) => x.seite === seite && x.n === nParam),
  );
  const hatFundstelleAufSeite = fundstellen.some((x) => x.seite === seite);
  const link = (ziel: { seite: number; n?: number }) => {
    const p = new URLSearchParams();
    if (begriff) p.set("q", begriff);
    p.set("seite", String(ziel.seite));
    if (ziel.n) p.set("n", String(ziel.n));
    return `/import/dokumente/${d.id}?${p}`;
  };
  const vorher = fundstellen.length > 0 && hatFundstelleAufSeite ? fundstellen[(aktuell - 1 + fundstellen.length) % fundstellen.length] : null;
  const danach = fundstellen.length > 0 ? (hatFundstelleAufSeite ? fundstellen[(aktuell + 1) % fundstellen.length] : fundstellen.find((x) => x.seite > seite) ?? fundstellen[0]) : null;
  const seitenText = d.seiten.find((s) => s.nummer === seite)?.text ?? "";
  const seitenMitTreffer = new Set(fundstellen.map((x) => x.seite));

  const dateiUrl = `/api/dokumente/${d.id}`;
  const istPdf = d.mimeType === "application/pdf";
  const zuordnung = d.gesellschaft
    ? { href: `/gesellschaften/${d.gesellschaft.id}`, text: d.gesellschaft.name }
    : d.haus
      ? { href: `/haeuser/${d.haus.id}`, text: d.haus.bezeichnung }
      : d.kredit
        ? { href: `/gesellschaften/kredite/${d.kredit.id}`, text: d.kredit.bezeichnung }
        : null;

  // Herleitung des Vorschlags (nur beim Bestätigen): was wurde woran erkannt
  let formular = null;
  if (bearbeiten) {
    const volltext = d.seiten.map((s) => s.text).join("\n");
    const kandidaten = await ladeZuordnungsKandidaten(kontext);
    const kat = erkenneKategorie(volltext, d.dateiname);
    const jahr = jahrbezogen(kat?.kategorie ?? null) ? erkenneJahr(volltext, d.dateiname) : null;
    const datum = jahr ? null : erkenneDatum(volltext);
    const obj = erkenneObjekt(volltext, kandidaten, ueblicheZuordnung(kat?.kategorie ?? null));
    const gruende = [
      kat && fuelle(td.erkanntKategorie, { wort: kat.stichwort }),
      obj && fuelle(td.erkanntObjekt, { begriff: obj.begriff }),
      jahr && fuelle(td.erkanntJahr, { jahr }),
      datum && fuelle(td.erkanntDatum, { datum: f.datum(datum) }),
    ].filter(Boolean) as string[];
    const zuordnungWert = d.gesellschaftId ? `gesellschaft:${d.gesellschaftId}` : d.hausId ? `haus:${d.hausId}` : d.kreditId ? `kredit:${d.kreditId}` : null;
    formular = (
      <Karte titel={d.bestaetigt ? td.bearbeiten : td.bestaetigen}>
        <p className="mb-3 text-sm text-slate-600">{td.bestaetigenHinweis}</p>
        <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm">
          <span className="font-medium">{td.erkannt}: </span>
          {gruende.length > 0 ? gruende.join(" · ") : td.nichtsErkannt}
        </div>
        <BestaetigenFormular
          td={td}
          aktion={dokumentBestaetigen.bind(null, d.id)}
          objekte={kandidaten.map(({ art, id, name }) => ({ art, id, name }))}
          start={{ titel: d.titel, kategorie: d.kategorie, jahr: d.jahr, datum: isoDatum(d.dokumentDatum), zuordnung: zuordnungWert }}
        />
      </Karte>
    );
  }

  return (
    <div className="max-w-7xl space-y-6">
      <Seitenkopf
        titel={
          <>
            {d.titel} {!d.bestaetigt && <Marke ton="warnung">{td.unbestaetigt}</Marke>}
          </>
        }
        beschreibung={`${td.original}: ${d.dateiname}`}
        zurueck={{ href: begriff ? `/import/dokumente?q=${encodeURIComponent(begriff)}` : "/import/dokumente", text: td.titel }}
        aktionen={
          <>
            <a href={dateiUrl} target="_blank" rel="noopener" className={knopfKlasse("sekundaer")}>
              {td.oeffnen}
            </a>
            {schreiben && d.bestaetigt && !bearbeiten && <KnopfLink href={`/import/dokumente/${d.id}?bearbeiten=1`}>{td.bearbeiten}</KnopfLink>}
          </>
        }
      />

      {formular}

      <Karte>
        <Angaben
          eintraege={[
            [td.name, d.titel],
            [td.originalname, d.dateiname],
            [td.kategorie, d.kategorie ?? "–"],
            [td.zuordnung, zuordnung ? <Link href={zuordnung.href} className="hover:underline">{zuordnung.text}</Link> : "–"],
            [td.jahr, d.jahr ?? "–"],
            [td.datum, d.dokumentDatum ? f.datum(d.dokumentDatum) : "–"],
            [
              td.text,
              <>
                {d.textQuelle ? td.textQuellen[d.textQuelle] : "–"}
                {d.seitenAnzahl ? ` · ${d.seitenAnzahl === 1 ? td.seitenZahl.eine : fuelle(td.seitenZahl.mehrere, { anzahl: d.seitenAnzahl })}` : ""}
                {d.textHinweis && (
                  <div className="text-xs text-amber-700">{fuelle(td.textHinweise[d.textHinweis as keyof typeof td.textHinweise] ?? "", { max: MAX_OCR_SEITEN })}</div>
                )}
              </>,
            ],
            [td.hochgeladen, `${f.datum(d.erstelltAm)}${d.hochgeladenVon ? ` ${fuelle(td.hochgeladenVon, { name: d.hochgeladenVon.name })}` : ""}`],
          ]}
        />
      </Karte>

      <Karte titel={td.imDokumentSuchen}>
        <form method="get" className="mb-4 flex flex-wrap items-end gap-3" role="search">
          <input
            name="q"
            type="search"
            defaultValue={begriff}
            placeholder={td.platzhalter}
            aria-label={td.imDokumentSuchen}
            className="min-w-64 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button type="submit" className={knopfKlasse()}>
            {td.suchen}
          </button>
        </form>

        {begriff.length >= 2 && (
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm" data-nicht-drucken>
            {fundstellen.length === 0 ? (
              <span className="text-slate-600">{td.keineFundstelle}</span>
            ) : (
              <>
                <span className="font-medium">
                  {hatFundstelleAufSeite ? `${aktuell + 1} / ${fundstellen.length}` : fundstellen.length} · {fuelle(td.fundstelleSeite, { nummer: seite })}
                </span>
                {vorher && (
                  <Link href={link(vorher)} scroll={false} className="text-sky-700 hover:underline">
                    {td.vorherige}
                  </Link>
                )}
                {danach && (
                  <Link href={link(danach)} scroll={false} className="text-sky-700 hover:underline">
                    {td.naechste}
                  </Link>
                )}
              </>
            )}
          </div>
        )}

        {d.seiten.length > 1 && (
          <nav className="mb-3 flex flex-wrap gap-1 text-xs" aria-label={td.seiten} data-nicht-drucken>
            {d.seiten.map((s) => (
              <Link
                key={s.nummer}
                href={link({ seite: s.nummer })}
                scroll={false}
                aria-current={s.nummer === seite ? "page" : undefined}
                className={`rounded px-2 py-0.5 ring-1 ring-inset ${s.nummer === seite ? "bg-slate-900 text-white ring-slate-900" : seitenMitTreffer.has(s.nummer) ? "bg-yellow-100 ring-yellow-300" : "ring-slate-200 hover:bg-slate-50"}`}
              >
                {s.nummer}
              </Link>
            ))}
          </nav>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-1 text-sm font-medium">{fuelle(td.textDerSeite, { nummer: seite })}</h3>
            <p className="mb-2 text-xs text-slate-500">{fuelle(td.textDerSeiteHinweis, { quelle: d.textQuelle ? td.textQuellen[d.textQuelle] : "–" })}</p>
            {d.seiten.length === 0 ? (
              <Leer>{d.textHinweis ? fuelle(td.textHinweise[d.textHinweis as keyof typeof td.textHinweise] ?? "", { max: MAX_OCR_SEITEN }) : td.textHinweise.keinText}</Leer>
            ) : (
              <pre data-textfeld className="h-[70vh] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed">
                {(() => {
                  let n = 0;
                  return markiere(seitenText, begriff.length >= 2 ? begriff : "").map((teil, i) => {
                    if (!teil.treffer) return <span key={i}>{teil.text}</span>;
                    const istAktuell = n++ === nParam;
                    return (
                      <mark key={i} data-aktuell={istAktuell ? "" : undefined} className={`rounded px-0.5 ${istAktuell ? "bg-orange-300 ring-2 ring-orange-500" : "bg-yellow-200"}`}>
                        {teil.text}
                      </mark>
                    );
                  });
                })()}
              </pre>
            )}
            <ZurFundstelle schluessel={`${seite}-${nParam}-${begriff}`} />
          </div>
          <div>
            <h3 className="mb-1 text-sm font-medium">{td.original}</h3>
            {istPdf ? (
              <iframe
                key={`${seite}-${begriff}`}
                src={`${dateiUrl}#page=${seite}${begriff ? `&search=${encodeURIComponent(begriff)}` : ""}`}
                title={d.titel}
                className="h-[75vh] w-full rounded-lg border border-slate-200"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={dateiUrl} alt={d.titel} className="max-h-[75vh] w-full rounded-lg border border-slate-200 object-contain" />
            )}
          </div>
        </div>
      </Karte>

      {schreiben && (
        <div className="flex flex-wrap gap-3" data-nicht-drucken>
          <Formular aktion={textNeuErkennen.bind(null, d.id)} absenden={td.neuErkennen} art="sekundaer" laeuftText={td.laeuft} />
          <Formular aktion={dokumentLoeschen.bind(null, d.id)} absenden={td.loeschen} art="gefahr" bestaetigen={td.loeschenBestaetigen} />
        </div>
      )}
    </div>
  );
}
