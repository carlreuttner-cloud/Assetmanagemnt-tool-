/**
 * Schreibt ZIP-Archive (eigene, kleine Umsetzung nach der öffentlichen ZIP-Spezifikation, ohne ZIP64).
 * Dateien werden nacheinander erzeugt, damit immer nur eine Datei im Speicher liegt. Texte werden
 * komprimiert (Deflate), bereits komprimierte Formate wie PDF und Bilder unverändert gespeichert.
 */
import { deflateRawSync } from "node:zlib";

export interface ZipEintrag {
  /** Pfad im Archiv mit „/“ als Trenner */
  pfad: string;
  datum: Date;
  komprimieren: boolean;
  /** Inhalt; wird erst beim Schreiben geladen */
  inhalt: () => Promise<Uint8Array>;
}

/** Grenzen ohne ZIP64 */
export const ZIP_MAX_DATEIEN = 65_535;
export const ZIP_MAX_BYTES = 0xffff_ffff;

const CRC_TABELLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(daten: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < daten.length; i++) c = CRC_TABELLE[(c ^ daten[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Datum und Uhrzeit im DOS-Format (lokale Felder in UTC, auf 2 Sekunden genau, ab 1980). */
function dosZeit(d: Date): { zeit: number; datum: number } {
  const jahr = Math.max(1980, d.getUTCFullYear());
  return {
    zeit: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
    datum: ((jahr - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

const UTF8 = 0x0800;

function kopf(laenge: number): { buf: Uint8Array; v: DataView } {
  const buf = new Uint8Array(laenge);
  return { buf, v: new DataView(buf.buffer) };
}

/** Erzeugt das Archiv Stück für Stück. */
export async function* zipTeile(eintraege: ZipEintrag[]): AsyncGenerator<Uint8Array> {
  if (eintraege.length > ZIP_MAX_DATEIEN) throw new RangeError("zu viele Dateien für ein ZIP ohne ZIP64");
  const enc = new TextEncoder();
  const zentral: Uint8Array[] = [];
  let versatz = 0;
  for (const e of eintraege) {
    const name = enc.encode(e.pfad);
    const roh = await e.inhalt();
    const crc = crc32(roh);
    const gepackt = e.komprimieren ? new Uint8Array(deflateRawSync(roh)) : roh;
    const methode = e.komprimieren && gepackt.length < roh.length ? 8 : 0;
    const daten = methode === 8 ? gepackt : roh;
    if (versatz + 30 + name.length + daten.length > ZIP_MAX_BYTES) throw new RangeError("Archiv größer als 4 GB");
    const { zeit, datum } = dosZeit(e.datum);

    const lokal = kopf(30);
    lokal.v.setUint32(0, 0x04034b50, true);
    lokal.v.setUint16(4, 20, true);
    lokal.v.setUint16(6, UTF8, true);
    lokal.v.setUint16(8, methode, true);
    lokal.v.setUint16(10, zeit, true);
    lokal.v.setUint16(12, datum, true);
    lokal.v.setUint32(14, crc, true);
    lokal.v.setUint32(18, daten.length, true);
    lokal.v.setUint32(22, roh.length, true);
    lokal.v.setUint16(26, name.length, true);
    lokal.v.setUint16(28, 0, true);
    yield lokal.buf;
    yield name;
    yield daten;

    const z = kopf(46 + name.length);
    z.v.setUint32(0, 0x02014b50, true);
    z.v.setUint16(4, 20, true);
    z.v.setUint16(6, 20, true);
    z.v.setUint16(8, UTF8, true);
    z.v.setUint16(10, methode, true);
    z.v.setUint16(12, zeit, true);
    z.v.setUint16(14, datum, true);
    z.v.setUint32(16, crc, true);
    z.v.setUint32(20, daten.length, true);
    z.v.setUint32(24, roh.length, true);
    z.v.setUint16(28, name.length, true);
    z.v.setUint32(42, versatz, true);
    z.buf.set(name, 46);
    zentral.push(z.buf);
    versatz += 30 + name.length + daten.length;
  }
  const groesse = zentral.reduce((s, b) => s + b.length, 0);
  for (const b of zentral) yield b;
  const ende = kopf(22);
  ende.v.setUint32(0, 0x06054b50, true);
  ende.v.setUint16(8, eintraege.length, true);
  ende.v.setUint16(10, eintraege.length, true);
  ende.v.setUint32(12, groesse, true);
  ende.v.setUint32(16, versatz, true);
  yield ende.buf;
}

/** Ganzes Archiv als ein Puffer (für Tests und kleine Archive). */
export async function zipPuffer(eintraege: ZipEintrag[]): Promise<Uint8Array> {
  const teile: Uint8Array[] = [];
  for await (const t of zipTeile(eintraege)) teile.push(t);
  const out = new Uint8Array(teile.reduce((s, t) => s + t.length, 0));
  let i = 0;
  for (const t of teile) {
    out.set(t, i);
    i += t.length;
  }
  return out;
}
