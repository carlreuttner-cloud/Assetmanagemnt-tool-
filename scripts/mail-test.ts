/**
 * Schickt drei Testmails an den lokalen Test-Mailserver (TESTDATEN, keine echten Daten):
 * 1. bekannte Bank mit Kontoauszug (PDF) → Posteingang „Zu prüfen“
 * 2. unbekannter Absender mit PDF → Quarantäne
 * 3. bekannte Bank ohne Anhang → nur im Mail-Protokoll
 * Aufruf (Docker): docker compose run --rm migrate npm run mail:test
 */
import nodemailer from "nodemailer";

const host = process.env.MAIL_SMTP_HOST ?? "localhost";
const port = Number(process.env.MAIL_SMTP_PORT ?? 2525);
const an = process.env.MAIL_TEST_AN ?? `demo-eingang@${process.env.EINGANG_MAIL_DOMAIN || "eingang.localhost"}`;

/** Kleines PDF mit Textebene (eigene Erzeugung, nur für Tests). */
function testPdf(zeilen: string[]): Buffer {
  const text = zeilen.map((z, i) => `BT /F1 11 Tf 60 ${790 - i * 18} Td (${z.replace(/[()\\]/g, "\\$&")}) Tj ET`).join("\n");
  const objekte = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(text, "latin1")} >>\nstream\n${text}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const versatz: number[] = [];
  objekte.forEach((o, i) => {
    versatz.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n${versatz.map((v) => `${String(v).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objekte.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

async function main() {
  const transport = nodemailer.createTransport({ host, port, secure: false, ignoreTLS: true });
  const stempel = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const mails = [
    {
      from: "Testbank Nord AG <kredit@testbank-nord.example>",
      subject: "Darlehenskontoauszug zum 31.12.2025",
      text: "Sehr geehrte Damen und Herren,\nanbei der Darlehenskontoauszug. (TESTDATEN)",
      attachments: [{ filename: `Kontoauszug_${stempel}.pdf`, content: testPdf(["TESTDOKUMENT", "Testbank Nord AG", "Darlehenskontoauszug zum 31.12.2025", "Darlehens-Nr.: TN-2017-00417", "IBAN DE19 9999 0010 2017 0004 17", `Belegnummer ${stempel}`]) }],
    },
    {
      from: "Unbekannt <rechnung@unbekannt.example>",
      subject: "Ihre Rechnung",
      text: "Bitte Anhang öffnen. (TESTDATEN)",
      attachments: [{ filename: `Rechnung_${stempel}.pdf`, content: testPdf(["TESTDOKUMENT", "Rechnung", `Nummer ${stempel}`]) }],
    },
    { from: "Testbank Nord AG <kredit@testbank-nord.example>", subject: "Rückfrage ohne Anhang", text: "Bitte um Rückruf. (TESTDATEN)" },
  ];
  for (const m of mails) {
    await transport.sendMail({ ...m, to: an });
    console.log(`Gesendet an ${an}: ${m.subject}`);
  }
}

main().catch((e) => {
  console.error("Testmails konnten nicht gesendet werden:", e.message);
  process.exit(1);
});
