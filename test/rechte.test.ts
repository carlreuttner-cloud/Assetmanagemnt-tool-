import { describe, expect, it } from "vitest";
import { darf, startseite } from "@/lib/auth/rechte";

describe("rechte", () => {
  it("Admin darf alles", () => {
    expect(darf("ADMIN", "benutzerverwaltung", "schreiben")).toBe(true);
  });
  it("Mitarbeiter darf keine Benutzer verwalten", () => {
    expect(darf("MITARBEITER", "haeuser", "schreiben")).toBe(true);
    expect(darf("MITARBEITER", "benutzerverwaltung")).toBe(false);
  });
  it("Hausverwaltung darf nur importieren", () => {
    expect(darf("HAUSVERWALTUNG", "import", "schreiben")).toBe(true);
    expect(darf("HAUSVERWALTUNG", "haeuser")).toBe(false);
    expect(darf("HAUSVERWALTUNG", "uebersicht")).toBe(false);
    expect(startseite("HAUSVERWALTUNG")).toBe("/import");
  });
  it("Investor sieht nur das Investorenportal", () => {
    expect(darf("INVESTOR", "investorenportal")).toBe(true);
    expect(darf("INVESTOR", "investorenportal", "schreiben")).toBe(false);
    expect(darf("INVESTOR", "haeuser")).toBe(false);
    expect(darf("INVESTOR", "gesellschaften")).toBe(false);
    expect(darf("INVESTOR", "dokumente")).toBe(false);
    expect(darf("INVESTOR", "import")).toBe(false);
    expect(startseite("INVESTOR")).toBe("/portal");
    expect(darf("MITARBEITER", "investorenportal")).toBe(true);
  });
});
