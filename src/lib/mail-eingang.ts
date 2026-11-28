/**
 * Reine Hilfen für den E-Mail-Eingang (ohne Datenbank): Import-Adresse, bekannte Absender und die
 * Auswertung der Absenderprüfung (SPF/DKIM/DMARC) des Mail-Dienstes.
 */
import { randomBytes } from "node:crypto";

export const MAX_MAIL_MB = 40;
export const MAX_ANHAENGE = 20;
export const STANDARD_MAIL_DOMAIN = "eingang.localhost";

export const mailDomain = () => (process.env.EINGANG_MAIL_DOMAIN || STANDARD_MAIL_DOMAIN).toLowerCase();

export const normalisiereAdresse = (adresse: string) => adresse.trim().toLowerCase();

/** Gültige Absender-Angabe: vollständige Adresse oder „@domain.tld“. */
export function istAbsenderMuster(wert: string) {
  return /^([^\s@]+)?@[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(wert.trim());
}

/** Neue Kennung für die Import-Adresse, z. B. „demo-immobilien-k7x2qp“. */
export function neueKennung(slug: string) {
  const basis = slug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "eingang";
  const zeichen = "abcdefghjkmnpqrstuvwxyz23456789";
  const zufall = [...randomBytes(6)].map((b) => zeichen[b % zeichen.length]).join("");
  return `${basis}-${zufall}`;
}

/** Kennungen aus den Empfängern, deren Domain zur Import-Domain passt („kennung+zusatz@…“ erlaubt). */
export function kennungenAus(empfaenger: string[], domain: string): string[] {
  const d = domain.toLowerCase();
  const kennungen = new Set<string>();
  for (const roh of empfaenger) {
    const a = normalisiereAdresse(roh);
    const at = a.lastIndexOf("@");
    if (at <= 0 || a.slice(at + 1) !== d) continue;
    kennungen.add(a.slice(0, at).split("+")[0]);
  }
  return [...kennungen];
}

/** Bekannt ist ein Absender, wenn seine Adresse oder seine Domain („@bank.de“) eingetragen ist. */
export function findeBekannten<T extends { adresse: string }>(adresse: string, liste: T[]): T | null {
  const a = normalisiereAdresse(adresse);
  const domain = a.slice(a.lastIndexOf("@"));
  return liste.find((x) => x.adresse === a) ?? liste.find((x) => x.adresse === domain) ?? null;
}

export type Pruefung = { verdaechtig: boolean; text: string | null };

/**
 * Wertet „Authentication-Results“ aus, sofern der Mail-Dienst sie mitliefert. Verdächtig ist eine
 * Mail mit dmarc=fail oder mit spf=fail ohne dkim=pass. Ohne Angabe gilt sie nicht als verdächtig;
 * dann entscheidet allein die Liste der bekannten Absender.
 */
export function werteAbsenderpruefungAus(header: string | string[] | null | undefined): Pruefung {
  const text = (Array.isArray(header) ? header.join("; ") : (header ?? "")).replace(/\s+/g, " ").trim();
  if (!text) return { verdaechtig: false, text: null };
  const wert = (art: string) => text.match(new RegExp(`\\b${art}=([a-z]+)`, "i"))?.[1]?.toLowerCase() ?? null;
  const spf = wert("spf");
  const dkim = wert("dkim");
  const dmarc = wert("dmarc");
  const verdaechtig = dmarc === "fail" || (spf === "fail" && dkim !== "pass");
  const kurz = [spf && `SPF ${spf}`, dkim && `DKIM ${dkim}`, dmarc && `DMARC ${dmarc}`].filter(Boolean).join(", ");
  return { verdaechtig, text: kurz || text.slice(0, 200) };
}

/** Hinweise eines Mail-Protokolls (getrennt durch „|“); Fehlertexte beginnen mit „fehler:“. */
export function mailHinweise(hinweis: string | null): string[] {
  return (hinweis ?? "").split("|").filter((h) => h && !h.startsWith("fehler:"));
}
