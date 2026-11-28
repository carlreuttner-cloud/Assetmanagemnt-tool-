import "server-only";
import { createHash } from "node:crypto";
import { texte, type Texte } from "@/i18n";
import type { mandantDb } from "@/lib/db/mandant";
import { DOKUMENT_TYPEN, MAX_DOKUMENT_MB, dokumentTypAusInhalt, pfadAufDisk, speichere } from "@/lib/dateispeicher";
import { alsDbDatum } from "@/lib/datum";
import { erkenneText } from "@/lib/dokument-text";
import { kombiniereKi, lerneRegeln, schlageVor, type EingangKandidat, type EingangVorschlag, type ObjektRef, type Regel } from "@/lib/eingang";
import { KiFehler, fuehreEingangsErkennungDurch, kiModus } from "@/lib/ki-claude";
import type { AbsenderArt } from "@/lib/dokument-vorschlag";

type Db = ReturnType<typeof mandantDb>;

/** Alle Objekte des Mandanten mit ihren Kennungen (der Posteingang ordnet mandantenweit zu). */
export async function ladeEingangKandidaten(db: Db): Promise<EingangKandidat[]> {
  const [gesellschaften, haeuser, kredite] = await Promise.all([
    db.gesellschaft.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, registernummer: true } }),
    db.haus.findMany({ orderBy: { bezeichnung: "asc" }, select: { id: true, bezeichnung: true, strasse: true } }),
    db.kredit.findMany({ orderBy: { bezeichnung: "asc" }, select: { id: true, bezeichnung: true, kreditnummer: true, iban: true, gesellschaft: { select: { name: true } } } }),
  ]);
  return [
    ...gesellschaften.map((g) => ({ art: "gesellschaft" as const, id: g.id, name: g.name, ibans: [], kennungen: [g.registernummer?.replace(/\s*\(.*\)$/, "") ?? ""].filter(Boolean), adressen: [], namen: [g.name] })),
    ...haeuser.map((h) => ({ art: "haus" as const, id: h.id, name: h.bezeichnung, ibans: [], kennungen: [], adressen: [h.strasse ?? "", h.bezeichnung], namen: [] })),
    ...kredite.map((k) => ({
      art: "kredit" as const,
      id: k.id,
      name: `${k.bezeichnung} (${k.gesellschaft.name})`,
      ibans: [k.iban ?? ""].filter(Boolean),
      kennungen: [k.kreditnummer ?? ""].filter(Boolean),
      adressen: [],
      namen: [],
    })),
  ];
}

export async function ladeRegeln(db: Db): Promise<Regel[]> {
  const regeln = await db.zuordnungsregel.findMany({
    include: { gesellschaft: { select: { name: true } }, haus: { select: { bezeichnung: true } }, kredit: { select: { bezeichnung: true, gesellschaft: { select: { name: true } } } } },
  });
  return regeln.map((r) => ({
    merkmal: r.merkmal,
    wert: r.wert,
    objekt: r.gesellschaftId
      ? { art: "gesellschaft", id: r.gesellschaftId, name: r.gesellschaft!.name }
      : r.hausId
        ? { art: "haus", id: r.hausId, name: r.haus!.bezeichnung }
        : r.kreditId
          ? { art: "kredit", id: r.kreditId, name: `${r.kredit!.bezeichnung} (${r.kredit!.gesellschaft.name})` }
          : null,
    absenderArt: r.absenderArt,
    absenderName: r.absenderName,
    geaendertAm: r.geaendertAm.toISOString(),
  }));
}

/** Vorschlag aus Regeln, Text und (falls eingerichtet) KI. Ein Fehler der KI ändert nichts am Regel-Vorschlag. */
export async function erstelleVorschlag(db: Db, t: Texte, e: { text: string; dateiname: string; absenderAdresse: string | null }): Promise<EingangVorschlag> {
  const [kandidaten, regeln, banken] = await Promise.all([
    ladeEingangKandidaten(db),
    ladeRegeln(db),
    db.kredit.findMany({ where: { bank: { not: null } }, distinct: ["bank"], select: { bank: true } }),
  ]);
  let vorschlag = schlageVor({ ...e, kandidaten, regeln, banken: banken.map((b) => b.bank!), ohneKategorie: t.dateien.ohneKategorie });
  if (kiModus() === "claude" && e.text.trim().length >= 40 && vorschlag.sicherheit !== "hoch") {
    const codes = new Map<string, ObjektRef>(kandidaten.map((k, i) => [`O${i + 1}`, { art: k.art, id: k.id, name: k.name }]));
    try {
      const ki = await fuehreEingangsErkennungDurch(e.text, e.dateiname, kandidaten, t);
      vorschlag = kombiniereKi(vorschlag, ki.erkennung, e.text, codes, ki.modell, t.dateien.ohneKategorie);
    } catch (fehler) {
      if (!(fehler instanceof KiFehler)) console.error("KI-Erkennung im Posteingang fehlgeschlagen", fehler);
    }
  }
  return vorschlag;
}

export type Aufnahme = {
  daten: Uint8Array;
  dateiname: string;
  quelle: "HOCHLADEN" | "UPLOAD_LINK" | "EMAIL";
  hochgeladenVonId?: string | null;
  absenderAdresse?: string | null;
  absenderHinweis?: string | null;
  betreff?: string | null;
  mailtext?: string | null;
  /** Mails unbekannter Absender: in Quarantäne statt in die Prüfung */
  quarantaene?: boolean;
};

export type AufnahmeErgebnis = { ok: true; id: string } | { ok: false; fehler: string };

/**
 * Nimmt eine Datei in den Posteingang auf: prüft Typ (am Inhalt, nicht an der Endung), Größe und
 * Dubletten, speichert sie, erkennt den Text und erstellt den Vorschlag. Übernommen wird nichts.
 */
export async function nimmAuf(db: Db, mandant: { id: string; sprache: string }, a: Aufnahme): Promise<AufnahmeErgebnis> {
  const t = texte(mandant.sprache);
  const te = t.eingang;
  const name = (a.dateiname || "Dokument").slice(0, 255);
  if (a.daten.length === 0) return { ok: false, fehler: `${name}: ${t.dateien.keineDatei}` };
  if (a.daten.length > MAX_DOKUMENT_MB * 1024 * 1024) return { ok: false, fehler: `${name}: ${te.zuGross.replace("{mb}", String(MAX_DOKUMENT_MB))}` };
  const mimeType = dokumentTypAusInhalt(a.daten);
  if (!mimeType) return { ok: false, fehler: `${name}: ${t.dateien.falscherTyp}` };
  const pruefsumme = createHash("sha256").update(a.daten).digest("hex");
  const [dokument, eingang] = await Promise.all([
    db.dokument.findFirst({ where: { pruefsumme }, select: { titel: true } }),
    db.eingang.findFirst({ where: { pruefsumme, status: { not: "ABGELEHNT" } }, select: { dateiname: true } }),
  ]);
  if (dokument || eingang) return { ok: false, fehler: `${name}: ${te.doppelt.replace("{titel}", dokument?.titel ?? eingang!.dateiname)}` };

  const speicherPfad = await speichere(mandant.id, "eingang", DOKUMENT_TYPEN[mimeType], a.daten);
  let text = { quelle: "KEINE" as "PDF_TEXT" | "OCR" | "KEINE", seiten: [] as string[], seitenAnzahl: null as number | null, hinweis: null as string | null };
  try {
    text = await erkenneText(pfadAufDisk(speicherPfad), mimeType);
  } catch (fehler) {
    console.error("Texterkennung im Posteingang fehlgeschlagen", fehler);
  }
  const volltext = [a.betreff, a.mailtext, ...text.seiten.map((s) => s.replace(/\u0000/g, ""))].filter(Boolean).join("\n");
  const vorschlag = await erstelleVorschlag(db, t, { text: volltext, dateiname: name, absenderAdresse: a.absenderAdresse ?? null });
  const neu = await db.eingang.create({
    data: {
      quelle: a.quelle,
      status: a.quarantaene ? "QUARANTAENE" : vorschlag.sicherheit === "niedrig" ? "UNSICHER" : "ZU_PRUEFEN",
      dateiname: name,
      mimeType,
      groesseBytes: a.daten.length,
      speicherPfad,
      pruefsumme,
      seiten: text.seiten.map((s) => s.replace(/\u0000/g, "")),
      textQuelle: text.quelle,
      textHinweis: text.hinweis,
      seitenAnzahl: text.seitenAnzahl,
      absenderAdresse: a.absenderAdresse ?? null,
      absenderHinweis: a.absenderHinweis ?? null,
      betreff: a.betreff ?? null,
      mailtext: a.mailtext ?? null,
      vorschlag: vorschlag as never,
      hochgeladenVonId: a.hochgeladenVonId ?? null,
    } as never,
    select: { id: true },
  });
  return { ok: true, id: neu.id };
}

/** Volltext eines Eintrags (Betreff, Mailtext, Seiten) für Vorschlag und Lernen. */
export function eingangsText(e: { betreff: string | null; mailtext: string | null; seiten: unknown }): string {
  const seiten = Array.isArray(e.seiten) ? (e.seiten as string[]) : [];
  return [e.betreff, e.mailtext, ...seiten].filter(Boolean).join("\n");
}

export type Uebernahme = {
  titel: string;
  kategorie: string | null;
  jahr: number | null;
  datum: string | null;
  absenderArt: AbsenderArt | null;
  absenderName: string | null;
  objekt: ObjektRef | null;
};

/**
 * Übernimmt einen Eintrag als bestätigtes Dokument (mit erkanntem Text je Seite) und lernt
 * Regeln aus der Bestätigung. Gibt die ID des neuen Dokuments zurück.
 */
export async function uebernimm(db: Db, eingangId: string, u: Uebernahme, benutzerId: string): Promise<string> {
  const e = await db.eingang.findFirst({ where: { id: eingangId } });
  if (!e || e.status === "UEBERNOMMEN" || e.status === "ABGELEHNT" || e.status === "QUARANTAENE") throw new Error("Eingang nicht übernehmbar");
  const seiten = Array.isArray(e.seiten) ? (e.seiten as string[]) : [];
  const dokument = await db.dokument.create({
    data: {
      titel: u.titel.slice(0, 300),
      kategorie: u.kategorie,
      jahr: u.jahr,
      dokumentDatum: u.datum ? alsDbDatum(u.datum) : null,
      speicherPfad: e.speicherPfad,
      dateiname: e.dateiname,
      mimeType: e.mimeType,
      groesseBytes: e.groesseBytes,
      pruefsumme: e.pruefsumme,
      bestaetigt: true,
      textQuelle: e.textQuelle,
      textHinweis: e.textHinweis,
      seitenAnzahl: e.seitenAnzahl,
      hochgeladenVonId: e.hochgeladenVonId,
      absenderArt: u.absenderArt,
      absenderName: u.absenderName,
      gesellschaftId: u.objekt?.art === "gesellschaft" ? u.objekt.id : null,
      hausId: u.objekt?.art === "haus" ? u.objekt.id : null,
      kreditId: u.objekt?.art === "kredit" ? u.objekt.id : null,
    } as never,
    select: { id: true },
  });
  if (seiten.length) await db.dokumentSeite.createMany({ data: seiten.map((text, i) => ({ dokumentId: dokument.id, nummer: i + 1, text })) as never });
  await db.eingang.update({ where: { id: e.id }, data: { status: "UEBERNOMMEN", dokumentId: dokument.id, bearbeitetVonId: benutzerId, bearbeitetAm: new Date() } });

  const kandidaten = await ladeEingangKandidaten(db);
  const regeln = lerneRegeln({ text: eingangsText(e), absenderAdresse: e.absenderAdresse, kandidaten, objekt: u.objekt, absenderArt: u.absenderArt, absenderName: u.absenderName });
  for (const r of regeln) {
    const ziel = {
      gesellschaftId: r.objekt?.art === "gesellschaft" ? r.objekt.id : null,
      hausId: r.objekt?.art === "haus" ? r.objekt.id : null,
      kreditId: r.objekt?.art === "kredit" ? r.objekt.id : null,
      absenderArt: r.absenderArt,
      absenderName: r.absenderName,
    };
    const alt = await db.zuordnungsregel.findFirst({ where: { merkmal: r.merkmal, wert: r.wert } });
    if (!alt) await db.zuordnungsregel.create({ data: { merkmal: r.merkmal, wert: r.wert, ...ziel, erstelltVonId: benutzerId } as never });
    else {
      const gleich = alt.gesellschaftId === ziel.gesellschaftId && alt.hausId === ziel.hausId && alt.kreditId === ziel.kreditId && alt.absenderArt === ziel.absenderArt;
      await db.zuordnungsregel.update({ where: { id: alt.id }, data: { ...ziel, anzahl: gleich ? alt.anzahl + 1 : 1 } });
    }
  }
  return dokument.id;
}
