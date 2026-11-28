import { describe, expect, it } from "vitest";
import { findeBekannten, istAbsenderMuster, kennungenAus, neueKennung, werteAbsenderpruefungAus } from "@/lib/mail-eingang";

describe("E-Mail-Eingang", () => {
  it("bildet Kennungen und erkennt die Import-Adresse", () => {
    expect(neueKennung("Demo Immobilien GmbH")).toMatch(/^demo-immobilien-gmbh-[a-z2-9]{6}$/);
    expect(kennungenAus(["Demo-Eingang+bank@Eingang.localhost", "carl@example.de"], "eingang.localhost")).toEqual(["demo-eingang"]);
    expect(kennungenAus(["demo-eingang@andere.de"], "eingang.localhost")).toEqual([]);
  });

  it("kennt Absender über Adresse oder Domain", () => {
    const liste = [{ adresse: "@testbank-nord.example" }, { adresse: "post@hv-mueller.example" }];
    expect(findeBekannten("Kredit@Testbank-Nord.example", liste)?.adresse).toBe("@testbank-nord.example");
    expect(findeBekannten("post@hv-mueller.example", liste)?.adresse).toBe("post@hv-mueller.example");
    expect(findeBekannten("info@hv-mueller.example", liste)).toBeNull();
    expect(istAbsenderMuster("@bank.de")).toBe(true);
    expect(istAbsenderMuster("bank.de")).toBe(false);
  });

  it("wertet die Absenderprüfung aus", () => {
    expect(werteAbsenderpruefungAus(null)).toEqual({ verdaechtig: false, text: null });
    expect(werteAbsenderpruefungAus("mx.example; spf=pass smtp.mailfrom=bank.de; dkim=pass; dmarc=pass").verdaechtig).toBe(false);
    expect(werteAbsenderpruefungAus("mx.example; spf=fail; dkim=none; dmarc=none").verdaechtig).toBe(true);
    expect(werteAbsenderpruefungAus("mx.example; spf=fail; dkim=pass; dmarc=pass").verdaechtig).toBe(false);
    expect(werteAbsenderpruefungAus("mx.example; dmarc=fail").text).toBe("DMARC fail");
  });
});
