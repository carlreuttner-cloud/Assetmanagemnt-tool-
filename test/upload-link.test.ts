import { describe, expect, it } from "vitest";
import { MAX_DATEIEN_JE_LINK, hashSchluessel, linkStatus, neuerSchluessel } from "@/lib/upload-link";

describe("Upload-Links", () => {
  it("erzeugt zufällige Schlüssel und speichert nur den Hash", () => {
    const a = neuerSchluessel();
    const b = neuerSchluessel();
    expect(a.schluessel).not.toBe(b.schluessel);
    expect(a.schluessel).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.hash).toBe(hashSchluessel(a.schluessel));
    expect(a.hash).not.toContain(a.schluessel);
    expect(a.ende).toBe(a.schluessel.slice(-4));
  });

  it("prüft Widerruf, Ablauf und Höchstzahl", () => {
    const jetzt = new Date("2026-11-28T12:00:00Z");
    const basis = { gueltigBis: new Date("2026-12-31T00:00:00Z"), widerrufenAm: null, anzahlDateien: 0 };
    expect(linkStatus(basis, jetzt)).toBe("aktiv");
    expect(linkStatus({ ...basis, gueltigBis: new Date("2026-11-28T11:59:59Z") }, jetzt)).toBe("abgelaufen");
    expect(linkStatus({ ...basis, widerrufenAm: new Date("2026-11-27T00:00:00Z") }, jetzt)).toBe("widerrufen");
    expect(linkStatus({ ...basis, anzahlDateien: MAX_DATEIEN_JE_LINK }, jetzt)).toBe("voll");
  });
});
