import { timingSafeEqual } from "node:crypto";
import { verarbeiteMail } from "@/lib/daten/mail-eingang";
import { MAX_MAIL_MB } from "@/lib/mail-eingang";

/**
 * Webhook für einen echten Mail-Dienst: nimmt eine Mail im Rohformat (message/rfc822) an.
 * Nur aktiv, wenn EINGANG_MAIL_SCHLUESSEL gesetzt ist; der Dienst schickt ihn im Kopf
 * „Authorization: Bearer …“. Empfänger und Absender des Umschlags optional in
 * „X-Envelope-To“ (kommagetrennt) und „X-Envelope-From“.
 */
export async function POST(anfrage: Request) {
  const schluessel = process.env.EINGANG_MAIL_SCHLUESSEL;
  if (!schluessel) return Response.json({ fehler: "deaktiviert" }, { status: 503 });
  const gegeben = Buffer.from((anfrage.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  const erwartet = Buffer.from(schluessel);
  if (gegeben.length !== erwartet.length || !timingSafeEqual(gegeben, erwartet)) return Response.json({ fehler: "nicht berechtigt" }, { status: 401 });
  const laenge = Number(anfrage.headers.get("content-length") ?? 0);
  if (laenge > MAX_MAIL_MB * 1024 * 1024) return Response.json({ ergebnis: "ZU_GROSS" }, { status: 413 });
  const roh = Buffer.from(await anfrage.arrayBuffer());
  const an = (anfrage.headers.get("x-envelope-to") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const r = await verarbeiteMail(roh, { an, von: anfrage.headers.get("x-envelope-from") });
  // Unbekannte Adresse: 404, damit der Dienst die Mail zurückweisen kann
  return Response.json(r, { status: r.ergebnis === "UNBEKANNTE_ADRESSE" ? 404 : r.ergebnis === "ZU_GROSS" ? 413 : r.ergebnis === "UNLESBAR" ? 400 : 200 });
}
