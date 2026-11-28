import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { ladeDatenraum } from "@/lib/daten/datenraum";
import { datenraumEintraege } from "@/lib/daten/datenraum-paket";
import { sichererName } from "@/lib/datenraum";
import { formatierer } from "@/lib/format";
import { ZIP_MAX_DATEIEN, zipTeile } from "@/lib/zip";

/** Lädt den Datenraum eines Hauses oder einer Gesellschaft als ZIP herunter (nur mit Schreibrecht für Dokumente). */
export async function GET(anfrage: Request) {
  const kontext = await pruefeZugriff("dokumente", "schreiben");
  const t = texte(kontext.mandant.sprache);
  const url = new URL(anfrage.url);
  const art = url.searchParams.get("art");
  const id = url.searchParams.get("id");
  if ((art !== "gesellschaft" && art !== "haus") || !id) return new Response(null, { status: 400 });
  const raum = await ladeDatenraum(kontext, art, id, t.datenraum.ordner, { unbestaetigt: url.searchParams.get("unbestaetigt") === "1" });
  if (!raum) return new Response(null, { status: 404 });
  if (raum.eintraege.length + 3 > ZIP_MAX_DATEIEN || raum.bytes > 0xffff_0000) return new Response(t.datenraum.zuGross, { status: 413 });
  const jetzt = new Date();
  const teile = zipTeile(datenraumEintraege(raum, t, formatierer(kontext.mandant), kontext.benutzer.name ?? "", jetzt));
  const strom = new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      const { value, done } = await teile.next();
      if (done) ctrl.close();
      else ctrl.enqueue(value);
    },
  });
  const datei = `${sichererName(`Datenraum ${raum.name}`)} ${jetzt.toISOString().slice(0, 10)}.zip`;
  return new Response(strom, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${datei}"; filename*=UTF-8''${encodeURIComponent(datei)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
