import Link from "next/link";
import { notFound } from "next/navigation";
import { Formular } from "@/components/formular";
import { Angaben, Karte, Marke, Seitenkopf } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { ladeEingangKandidaten } from "@/lib/daten/eingang";
import type { EingangVorschlag } from "@/lib/eingang";
import { formatierer } from "@/lib/format";
import { mailHinweise } from "@/lib/mail-eingang";
import { BestaetigenFormular } from "../../import/dokumente/[id]/bestaetigen-formular";
import { eingangAblehnen, eingangFreigeben, eingangUebernehmen } from "../aktionen";
import { Gruende, SicherheitMarke } from "../eingang-bausteine";

export default async function EingangSeite({ params }: PageProps<"/posteingang/[id]">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("dokumente", "schreiben");
  await sichtbarkeit(kontext);
  const t = texte(kontext.mandant.sprache);
  const te = t.eingang;
  const td = te.detail;
  const f = formatierer(kontext.mandant);
  const e = await kontext.db.eingang.findFirst({ where: { id }, include: { dokument: { select: { id: true, titel: true } }, eingangMail: { select: { pruefung: true, hinweis: true } } } });
  if (!e) notFound();
  const v = e.vorschlag as unknown as EingangVorschlag | null;
  const seiten = Array.isArray(e.seiten) ? (e.seiten as string[]) : [];
  const bearbeiter = e.bearbeitetVonId ? await kontext.db.mitgliedschaft.findFirst({ where: { benutzerId: e.bearbeitetVonId }, select: { benutzer: { select: { name: true } } } }) : null;
  const offen = e.status === "ZU_PRUEFEN" || e.status === "UNSICHER";
  const dateiUrl = `/api/eingang/${e.id}`;
  const istPdf = e.mimeType === "application/pdf";

  let formular = null;
  if (offen && v) {
    const kandidaten = await ladeEingangKandidaten(kontext.db);
    const vorbelegen = v.sicherheit !== "niedrig" && v.objekt;
    formular = (
      <Karte titel={td.pruefen}>
        <p className="mb-3 text-sm text-slate-600">{v.sicherheit === "niedrig" ? td.unsicherHinweis : td.pruefenHinweis}</p>
        <BestaetigenFormular
          td={t.dateien}
          aktion={eingangUebernehmen.bind(null, e.id)}
          objekte={kandidaten.map(({ art, id, name }) => ({ art, id, name }))}
          start={{
            titel: v.titel,
            kategorie: v.kategorie,
            jahr: v.jahr,
            datum: v.datum,
            zuordnung: vorbelegen ? `${v.objekt!.art}:${v.objekt!.id}` : null,
            absenderArt: v.absenderArt,
            absenderName: v.absenderName,
          }}
          absenden={td.uebernehmen}
        />
        <div className="mt-4 border-t border-slate-100 pt-4">
          <Formular aktion={eingangAblehnen.bind(null, e.id)} absenden={td.ablehnen} art="gefahr" bestaetigen={td.ablehnenBestaetigen} />
        </div>
      </Karte>
    );
  }

  return (
    <div className="max-w-7xl space-y-6">
      <Seitenkopf
        titel={
          <>
            {v?.titel ?? e.dateiname} <Marke ton={e.status === "UEBERNOMMEN" ? "gut" : e.status === "ABGELEHNT" ? "neutral" : "warnung"}>{te.stati[e.status]}</Marke>
          </>
        }
        beschreibung={`${t.dateien.original}: ${e.dateiname}`}
        zurueck={{ href: "/posteingang", text: td.zurueck }}
      />

      {e.status === "QUARANTAENE" && (
        <Karte>
          <p className="mb-3 text-sm text-amber-900">{td.quarantaeneHinweis}</p>
          {e.eingangMail && (
            <ul className="mb-3 list-disc pl-5 text-sm text-slate-700" data-quarantaene-gruende>
              {mailHinweise(e.eingangMail.hinweis).map((h) => (
                <li key={h}>{t.mailEingang.hinweise[h as keyof typeof t.mailEingang.hinweise] ?? h}</li>
              ))}
              {e.eingangMail.pruefung && <li>{fuelle(t.mailEingang.pruefungText, { text: e.eingangMail.pruefung })}</li>}
            </ul>
          )}
          <div className="flex flex-wrap gap-3">
            <Formular aktion={eingangFreigeben.bind(null, e.id, false)} absenden={td.freigeben} />
            {e.absenderAdresse && <Formular aktion={eingangFreigeben.bind(null, e.id, true)} absenden={fuelle(t.mailEingang.freigebenUndErlauben, { adresse: e.absenderAdresse })} art="sekundaer" />}
            <Formular aktion={eingangAblehnen.bind(null, e.id)} absenden={td.ablehnen} art="gefahr" bestaetigen={td.ablehnenBestaetigen} />
          </div>
        </Karte>
      )}
      {(e.status === "UEBERNOMMEN" || e.status === "ABGELEHNT") && (
        <Karte>
          <p className="text-sm text-slate-700">
            {fuelle(td.bearbeitet, { status: te.stati[e.status], datum: e.bearbeitetAm ? f.datum(e.bearbeitetAm) : "–", name: bearbeiter?.benutzer.name ?? "–" })}
            {e.dokument && (
              <>
                {" · "}
                <Link href={`/import/dokumente/${e.dokument.id}`} className="font-medium text-sky-700 hover:underline">
                  {td.zumDokument}: {e.dokument.titel}
                </Link>
              </>
            )}
          </p>
        </Karte>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {v && (
            <Karte titel={te.gruendeTitel}>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                <SicherheitMarke s={v.sicherheit} t={t} />
                <span className="text-slate-600">{te.sicherheitErklaerung[v.sicherheit]}</span>
              </div>
              <Gruende v={v} t={t} f={f} />
              <p className="mt-3 text-xs text-slate-500">{v.kiModell ? fuelle(td.kiMitgewirkt, { modell: v.kiModell }) : td.nurRegeln}</p>
            </Karte>
          )}
          {formular}
          <Karte>
            <Angaben
              eintraege={[
                [td.eingangAm, f.datum(e.erstelltAm)],
                [td.quelle, te.quellen[e.quelle]],
                ...(e.absenderAdresse || e.absenderHinweis ? ([[td.von, e.absenderAdresse ?? e.absenderHinweis]] as Array<[string, string]>) : []),
                ...(e.betreff ? ([[td.betreff, e.betreff]] as Array<[string, string]>) : []),
                [td.datei, `${e.dateiname} · ${e.mimeType} · ${f.zahl(Math.max(1, Math.round(e.groesseBytes / 1024)), 0)} KB`],
              ]}
            />
            {e.mailtext && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-slate-600">{td.mailtext}</summary>
                <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-700">{e.mailtext}</pre>
              </details>
            )}
          </Karte>
        </div>
        <div className="space-y-6">
          {e.status !== "QUARANTAENE" && (
            <Karte titel={td.datei}>
              {istPdf ? (
                <iframe src={dateiUrl} title={e.dateiname} className="h-[70vh] w-full rounded border border-slate-200" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={dateiUrl} alt={e.dateiname} className="max-h-[70vh] w-full rounded border border-slate-200 object-contain" />
              )}
            </Karte>
          )}
          <Karte titel={td.text}>
            {seiten.length === 0 ? (
              <p className="text-sm text-slate-500">{td.keinText}</p>
            ) : (
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs text-slate-700">{seiten.join("\n\n")}</pre>
            )}
          </Karte>
        </div>
      </div>
    </div>
  );
}
