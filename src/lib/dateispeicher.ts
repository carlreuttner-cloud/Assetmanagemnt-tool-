import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

/**
 * Einfacher Dateispeicher im Verzeichnis UPLOAD_DIR (Docker-Volume). Dateien liegen je Mandant
 * getrennt und werden nur über die App ausgeliefert (Route mit Rechteprüfung), nie direkt.
 * Härtung (S3 in Deutschland, Backups) folgt in der Phase „Produktionsreife“.
 */

export const BILD_TYPEN: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const MAX_BILD_MB = 10;

function basis() {
  // Kommentar verhindert, dass Turbopack beim Build das ganze Projekt als Dateizugriff mitnimmt.
  return resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR ?? "./uploads");
}

function vollerPfad(relativ: string) {
  const voll = resolve(/* turbopackIgnore: true */ basis(), relativ);
  if (!voll.startsWith(basis() + sep)) throw new Error("Ungültiger Speicherpfad");
  return voll;
}

/** Prüft die ersten Bytes, damit kein anderer Dateityp als Bild durchgeht. */
export function bildTypAusInhalt(daten: Uint8Array): string | null {
  if (daten[0] === 0xff && daten[1] === 0xd8 && daten[2] === 0xff) return "image/jpeg";
  if (daten[0] === 0x89 && daten[1] === 0x50 && daten[2] === 0x4e && daten[3] === 0x47) return "image/png";
  const text = new TextDecoder("latin1").decode(daten.slice(0, 12));
  if (text.startsWith("RIFF") && text.slice(8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function speichere(mandantId: string, ordner: string, endung: string, daten: Uint8Array): Promise<string> {
  const relativ = join(/* turbopackIgnore: true */ mandantId, ordner, `${randomUUID()}.${endung}`);
  const voll = vollerPfad(relativ);
  await mkdir(dirname(voll), { recursive: true });
  await writeFile(voll, daten);
  return relativ;
}

/** Absoluter Pfad einer gespeicherten Datei, z. B. für Texterkennung mit externen Programmen. */
export function pfadAufDisk(relativ: string): string {
  return vollerPfad(relativ);
}

/** Dokumenttypen für den Upload (PDF und Bilder für die Texterkennung). */
export const DOKUMENT_TYPEN: Record<string, string> = { "application/pdf": "pdf", ...BILD_TYPEN };
export const MAX_DOKUMENT_MB = 30;

/** Prüft die ersten Bytes: PDF oder eines der Bildformate. */
export function dokumentTypAusInhalt(daten: Uint8Array): string | null {
  if (new TextDecoder("latin1").decode(daten.slice(0, 5)) === "%PDF-") return "application/pdf";
  return bildTypAusInhalt(daten);
}

export async function lese(relativ: string): Promise<Buffer> {
  return readFile(vollerPfad(relativ));
}

export async function entferne(relativ: string): Promise<void> {
  await unlink(vollerPfad(relativ)).catch(() => undefined);
}
