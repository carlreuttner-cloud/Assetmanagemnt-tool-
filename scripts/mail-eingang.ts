/**
 * Lokaler Test-Mailserver für den E-Mail-Eingang (Docker-Dienst „mail-eingang“, Port 2525).
 * Nimmt per SMTP nur Mails an Adressen der Import-Domain an und übergibt sie direkt an den
 * Posteingang. Für den echten Empfang (MX, TLS, Spam- und Virenprüfung) ist ein Mail-Dienst
 * vorgesehen, der den Webhook /api/eingang/mail aufruft; siehe ROADMAP.md, Produktionsreife.
 */
import "dotenv/config";
import { SMTPServer } from "smtp-server";
import { verarbeiteMail } from "../src/lib/daten/mail-eingang";
import { MAX_MAIL_MB, mailDomain } from "../src/lib/mail-eingang";

const port = Number(process.env.MAIL_EINGANG_PORT ?? 2525);
const domain = mailDomain();

const server = new SMTPServer({
  name: domain,
  authOptional: true,
  disabledCommands: ["AUTH", "STARTTLS"],
  size: MAX_MAIL_MB * 1024 * 1024,
  banner: "Test-Mailserver Posteingang",
  onRcptTo(adresse, _sitzung, fertig) {
    if (!adresse.address.toLowerCase().endsWith(`@${domain}`)) return fertig(new Error(`Nur Adressen @${domain}`));
    fertig();
  },
  onData(strom, sitzung, fertig) {
    const teile: Buffer[] = [];
    strom.on("data", (t: Buffer) => teile.push(t));
    strom.on("end", async () => {
      if ((strom as unknown as { sizeExceeded?: boolean }).sizeExceeded) return fertig(new Error("Mail zu groß"));
      try {
        const r = await verarbeiteMail(Buffer.concat(teile), {
          an: sitzung.envelope.rcptTo.map((a) => a.address),
          von: sitzung.envelope.mailFrom ? sitzung.envelope.mailFrom.address : null,
        });
        console.log(new Date().toISOString(), sitzung.envelope.mailFrom && sitzung.envelope.mailFrom.address, "→", r.ergebnis, "aufgenommen" in r ? r.aufgenommen : "");
        if (r.ergebnis === "UNBEKANNTE_ADRESSE") return fertig(new Error("Unbekannte Import-Adresse"));
        fertig();
      } catch (e) {
        console.error(e);
        fertig(new Error("Verarbeitung fehlgeschlagen"));
      }
    });
  },
});

server.on("error", (e) => console.error("Mailserver:", e.message));
server.listen(port, () => console.log(`Test-Mailserver für @${domain} auf Port ${port}`));
