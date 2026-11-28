"use server";

import { fuelle, texte } from "@/i18n";
import { mandantDb } from "@/lib/db/mandant";
import { nimmAuf } from "@/lib/daten/eingang";
import { EingabeFehler, fuehreAus, type AktionsErgebnis } from "@/lib/formular";
import { MAX_DATEIEN_JE_LINK, findeUploadLink } from "@/lib/upload-link";

const MAX_DATEIEN = 20;

/**
 * Hochladen über einen Upload-Link, ohne Anmeldung. Der Schlüssel wird bei jedem Aufruf neu geprüft;
 * gespeichert wird nur in den Posteingang des Mandanten des Links. Es wird nichts über vorhandene
 * Daten zurückgegeben, nur wie viele Dateien angekommen sind.
 */
export async function linkHochladen(schluessel: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const link = await findeUploadLink(String(schluessel));
    const t = texte(link?.mandant.sprache);
    const tu = t.uploadLink;
    if (!link || link.status !== "aktiv") throw new EingabeFehler(tu.ungueltig);
    const frei = MAX_DATEIEN_JE_LINK - link.anzahlDateien;
    const dateien = fd.getAll("dateien").filter((d): d is File => d instanceof File && d.size > 0).slice(0, Math.min(MAX_DATEIEN, frei));
    if (dateien.length === 0) throw new EingabeFehler(t.dateien.keineDatei);
    const db = mandantDb({ mandantId: link.mandantId, benutzerId: null });
    const notiz = fd.get("notiz");
    const mailtext = typeof notiz === "string" && notiz.trim() ? notiz.trim().slice(0, 2000) : null;
    let ok = 0;
    const fehler: string[] = [];
    for (const datei of dateien) {
      const r = await nimmAuf(db, link.mandant, {
        daten: new Uint8Array(await datei.arrayBuffer()),
        dateiname: datei.name,
        quelle: "UPLOAD_LINK",
        uploadLinkId: link.id,
        absenderVorgabe: link.absenderArt ? { art: link.absenderArt, name: link.name, grund: "uploadLink" } : null,
        absenderHinweis: link.name,
        mailtext,
      });
      if (r.ok) ok++;
      else fehler.push(r.fehler);
    }
    await db.uploadLink.update({ where: { id: link.id }, data: { anzahlDateien: { increment: ok }, zuletztGenutzt: new Date() } });
    if (ok === 0) throw new EingabeFehler(`${t.eingang.nichtAufgenommen} ${fehler.join("; ")}`);
    return { ok: [fuelle(tu.angekommen, { anzahl: ok }), fehler.length ? `${t.eingang.nichtAufgenommen} ${fehler.join("; ")}` : ""].filter(Boolean).join(" ") };
  });
}
