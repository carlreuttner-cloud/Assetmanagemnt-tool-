import "server-only";
/**
 * E-Mail-Eingang: verarbeitet eine Mail im Rohformat (MIME). Genutzt vom lokalen Test-Mailserver
 * (scripts/mail-eingang.ts) und vom Webhook /api/eingang/mail für einen echten Mail-Dienst.
 * Jede Mail an eine Import-Adresse wird protokolliert; Anhänge landen im Posteingang, bei
 * unbekannten oder verdächtigen Absendern in Quarantäne. Übernommen wird nichts.
 */
import { simpleParser, type AddressObject } from "mailparser";
import { basisDb } from "@/lib/db/client";
import { mandantDb } from "@/lib/db/mandant";
import { nimmAuf } from "@/lib/daten/eingang";
import { MAX_ANHAENGE, MAX_MAIL_MB, findeBekannten, kennungenAus, mailDomain, normalisiereAdresse, werteAbsenderpruefungAus } from "@/lib/mail-eingang";

export type MailUmschlag = { an?: string[]; von?: string | null };

export type MailVerarbeitung =
  | { ergebnis: "UNBEKANNTE_ADRESSE" | "ZU_GROSS" | "UNLESBAR" }
  | { ergebnis: "AUFGENOMMEN" | "QUARANTAENE" | "OHNE_ANHANG" | "DOPPELT" | "FEHLER"; mailId: string; aufgenommen: number };

const adressen = (feld: AddressObject | AddressObject[] | undefined) =>
  (Array.isArray(feld) ? feld : feld ? [feld] : []).flatMap((a) => a.value.map((v) => v.address ?? "")).filter(Boolean);

export async function verarbeiteMail(roh: Buffer, umschlag: MailUmschlag = {}): Promise<MailVerarbeitung> {
  if (roh.length > MAX_MAIL_MB * 1024 * 1024) return { ergebnis: "ZU_GROSS" };
  let mail;
  try {
    mail = await simpleParser(roh, { skipHtmlToText: false, skipTextLinks: true });
  } catch {
    return { ergebnis: "UNLESBAR" };
  }

  // Empfänger: zuerst der Umschlag (RCPT TO), sonst die Kopfzeilen
  const empfaenger = umschlag.an?.length ? umschlag.an : [...adressen(mail.to), ...adressen(mail.cc), String(mail.headers.get("delivered-to") ?? "")];
  const kennungen = kennungenAus(empfaenger, mailDomain());
  if (kennungen.length === 0) return { ergebnis: "UNBEKANNTE_ADRESSE" };
  // Einziger mandantenübergreifender Zugriff: Postfach zur Kennung finden
  const postfach = await basisDb.mailPostfach.findFirst({
    where: { kennung: { in: kennungen }, aktiv: true },
    select: { mandantId: true, mandant: { select: { id: true, sprache: true } } },
  });
  if (!postfach) return { ergebnis: "UNBEKANNTE_ADRESSE" };
  const db = mandantDb({ mandantId: postfach.mandantId, benutzerId: null });

  const absender = mail.from?.value[0];
  const von = normalisiereAdresse(absender?.address || umschlag.von || "unbekannt");
  const betreff = mail.subject?.slice(0, 300) ?? null;
  const nachrichtId = mail.messageId?.slice(0, 300) ?? null;
  const basis = { von, vonName: absender?.name?.slice(0, 200) || null, betreff, nachrichtId, groesseBytes: roh.length };

  if (nachrichtId && (await db.eingangMail.findFirst({ where: { nachrichtId, von }, select: { id: true } }))) {
    const m = await db.eingangMail.create({ data: { ...basis, ergebnis: "DOPPELT" } as never, select: { id: true } });
    return { ergebnis: "DOPPELT", mailId: m.id, aufgenommen: 0 };
  }

  const pruefung = werteAbsenderpruefungAus(mail.headers.get("authentication-results") as string | string[] | undefined);
  const bekannte = await db.mailAbsender.findMany({ select: { adresse: true, name: true, absenderArt: true } });
  const bekannt = findeBekannten(von, bekannte);
  const quarantaene = !bekannt || pruefung.verdaechtig;
  const hinweise: string[] = [];
  if (!bekannt) hinweise.push("unbekannt");
  if (pruefung.verdaechtig) hinweise.push("pruefung");

  // Eingebettete Bilder (Logos in der Signatur) zählen nicht als Anhang
  const alle = mail.attachments.filter((a) => !a.related && a.content?.length > 0);
  const anhaenge = alle.slice(0, MAX_ANHAENGE);
  if (alle.length > MAX_ANHAENGE) hinweise.push("zuViele");
  const mailtext = (mail.text ?? "").trim().slice(0, 5000) || null;

  const protokoll = await db.eingangMail.create({
    data: { ...basis, pruefung: pruefung.text, ergebnis: anhaenge.length === 0 ? "OHNE_ANHANG" : quarantaene ? "QUARANTAENE" : "AUFGENOMMEN", anzahlAnhaenge: alle.length, hinweis: hinweise.join("|") || null } as never,
    select: { id: true },
  });

  let aufgenommen = 0;
  const fehler: string[] = [];
  for (const a of anhaenge) {
    try {
      const r = await nimmAuf(db, postfach.mandant, {
        daten: new Uint8Array(a.content),
        dateiname: a.filename || "Anhang",
        quelle: "EMAIL",
        eingangMailId: protokoll.id,
        absenderAdresse: von,
        absenderHinweis: basis.vonName,
        absenderVorgabe: bekannt?.absenderArt ? { art: bekannt.absenderArt, name: bekannt.name ?? von, grund: "mailAbsender" } : null,
        betreff,
        mailtext,
        quarantaene,
      });
      if (r.ok) aufgenommen++;
      else fehler.push(r.fehler);
    } catch (e) {
      console.error("Mail-Anhang konnte nicht aufgenommen werden", e);
      fehler.push(a.filename ?? "Anhang");
    }
  }
  const ergebnis = anhaenge.length === 0 ? "OHNE_ANHANG" : aufgenommen === 0 ? "FEHLER" : quarantaene ? "QUARANTAENE" : "AUFGENOMMEN";
  await db.eingangMail.update({
    where: { id: protokoll.id },
    data: { ergebnis, aufgenommen, hinweis: [...hinweise, ...(fehler.length ? [`fehler:${fehler.join("; ").slice(0, 500)}`] : [])].join("|") || null } as never,
  });
  return { ergebnis, mailId: protokoll.id, aufgenommen };
}
