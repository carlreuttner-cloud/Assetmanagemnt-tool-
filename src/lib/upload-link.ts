/**
 * Upload-Links: persönlicher, widerrufbarer Zugang nur zum Hochladen in den Posteingang.
 * Der Schlüssel (32 Zufallsbytes) wird nur einmal angezeigt; gespeichert wird sein SHA-256-Hash.
 */
import { createHash, randomBytes } from "node:crypto";
import { basisDb } from "@/lib/db/client";

/** Höchstens so viele Dateien je Link insgesamt (Schutz vor Missbrauch) */
export const MAX_DATEIEN_JE_LINK = 500;
export const MAX_GUELTIG_TAGE = 365;

export const hashSchluessel = (schluessel: string) => createHash("sha256").update(schluessel).digest("hex");

export function neuerSchluessel() {
  const schluessel = randomBytes(32).toString("base64url");
  return { schluessel, hash: hashSchluessel(schluessel), ende: schluessel.slice(-4) };
}

export type LinkStatus = "aktiv" | "abgelaufen" | "widerrufen" | "voll";

export function linkStatus(l: { gueltigBis: Date; widerrufenAm: Date | null; anzahlDateien: number }, jetzt = new Date()): LinkStatus {
  if (l.widerrufenAm) return "widerrufen";
  if (l.gueltigBis.getTime() <= jetzt.getTime()) return "abgelaufen";
  if (l.anzahlDateien >= MAX_DATEIEN_JE_LINK) return "voll";
  return "aktiv";
}

/**
 * Sucht den Link zum Schlüssel mandantenübergreifend. Das ist der einzige Zugriff ohne Anmeldung;
 * danach wird ausschließlich mit der Datenbank des Mandanten des Links gearbeitet.
 */
export async function findeUploadLink(schluessel: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(schluessel)) return null;
  const link = await basisDb.uploadLink.findUnique({
    where: { schluesselHash: hashSchluessel(schluessel) },
    select: { id: true, mandantId: true, name: true, absenderArt: true, gueltigBis: true, widerrufenAm: true, anzahlDateien: true, mandant: { select: { id: true, name: true, sprache: true } } },
  });
  if (!link) return null;
  return { ...link, status: linkStatus(link) };
}
