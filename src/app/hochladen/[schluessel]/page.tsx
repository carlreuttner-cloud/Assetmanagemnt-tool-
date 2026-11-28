import type { Metadata } from "next";
import { DateiZone } from "@/components/datei-zone";
import { Formular } from "@/components/formular";
import { fuelle, texte } from "@/i18n";
import { DOKUMENT_TYPEN, MAX_DOKUMENT_MB } from "@/lib/dateispeicher";
import { findeUploadLink } from "@/lib/upload-link";
import { linkHochladen } from "./aktionen";

// Der Schlüssel steht im Pfad: nicht indexieren und nicht als Referrer weitergeben.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Öffentliche Upload-Seite: nur Hochladen, kein Zugriff auf Daten der App. */
export default async function UploadLinkSeite({ params }: PageProps<"/hochladen/[schluessel]">) {
  const { schluessel } = await params;
  const link = await findeUploadLink(schluessel);
  const t = texte(link?.mandant.sprache);
  const tu = t.uploadLink;
  const te = t.eingang;

  return (
    <main className="flex min-h-screen items-start justify-center px-4 py-12">
      <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        {!link || link.status !== "aktiv" ? (
          <>
            <h1 className="text-xl font-semibold">{tu.seitentitel}</h1>
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900" data-link-ungueltig>
              {tu.ungueltig}
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">{fuelle(tu.fuer, { mandant: link.mandant.name })}</h1>
            <p className="mt-1 text-sm text-slate-500">{fuelle(tu.persoenlich, { name: link.name })}</p>
            <p className="mt-4 text-sm text-slate-700">{tu.erklaerung}</p>
            <div className="mt-6">
              <Formular aktion={linkHochladen.bind(null, schluessel)} absenden={tu.absenden} zuruecksetzen laeuftText={tu.laeuft}>
                <DateiZone
                  name="dateien"
                  accept={Object.keys(DOKUMENT_TYPEN).join(",")}
                  texte={{ ziehen: te.ziehen, auswaehlen: te.auswaehlen, gewaehlt: te.gewaehlt, hinweis: fuelle(te.hochladenHinweis, { mb: MAX_DOKUMENT_MB }) }}
                />
                <label className="block text-sm">
                  <span className="text-slate-700">{tu.notiz}</span>
                  <textarea name="notiz" rows={3} maxLength={2000} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder={tu.notizBeispiel} />
                </label>
              </Formular>
            </div>
            <p className="mt-6 text-xs text-slate-500">{fuelle(tu.gueltigBis, { datum: link.gueltigBis.toLocaleDateString(link.mandant.sprache) })}</p>
          </>
        )}
      </div>
    </main>
  );
}
