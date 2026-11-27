import { describe, expect, it } from "vitest";
import { dokumentStatus, zaehleStatus } from "@/lib/dokumente";

const heute = "2026-11-24";
const n = (vorhanden: boolean, dokumentDatum: string | null = null, nichtErforderlich = false) => ({ vorhanden, dokumentDatum, nichtErforderlich });

describe("Dokumenten-Checkliste", () => {
  it("ohne Nachweis und ohne Automatik fehlt das Dokument", () => {
    expect(dokumentStatus({ gueltigMonate: 12 }, null, null, heute).status).toBe("fehlt");
    expect(dokumentStatus({ gueltigMonate: null }, n(false), null, heute).status).toBe("fehlt");
  });

  it("unbegrenzt gültige Dokumente sind auch ohne Datum vorhanden", () => {
    expect(dokumentStatus({ gueltigMonate: null }, n(true), null, heute).status).toBe("vorhanden");
  });

  it("befristete Dokumente ohne Datum gelten nicht als aktuell", () => {
    expect(dokumentStatus({ gueltigMonate: 12 }, n(true), null, heute).status).toBe("datumFehlt");
  });

  it("veraltet, läuft ab, vorhanden", () => {
    expect(dokumentStatus({ gueltigMonate: 12 }, n(true, "2025-10-01"), null, heute)).toMatchObject({ status: "veraltet", gueltigBis: "2026-10-01" });
    expect(dokumentStatus({ gueltigMonate: 12 }, n(true, "2025-12-15"), null, heute).status).toBe("laeuftAb");
    expect(dokumentStatus({ gueltigMonate: 12 }, n(true, "2026-06-01"), null, heute).status).toBe("vorhanden");
  });

  it("der jüngere Stand aus Nachweis oder Daten gewinnt", () => {
    const auto = { datum: "2025-12-31", beschreibung: "Gutachten" };
    expect(dokumentStatus({ gueltigMonate: 36 }, null, auto, heute)).toMatchObject({ status: "vorhanden", herkunft: "automatik" });
    expect(dokumentStatus({ gueltigMonate: 36 }, n(true, "2026-03-01"), auto, heute).herkunft).toBe("nachweis");
    expect(dokumentStatus({ gueltigMonate: 36 }, n(true, null), auto, heute).herkunft).toBe("automatik");
    expect(dokumentStatus({ gueltigMonate: 36 }, n(false), auto, heute).herkunft).toBe("automatik");
  });

  it("nicht erforderlich zählt nicht als offen", () => {
    const s = dokumentStatus({ gueltigMonate: 12 }, n(false, null, true), null, heute).status;
    expect(s).toBe("nichtErforderlich");
    expect(zaehleStatus([s, "fehlt", "veraltet", "vorhanden"])).toMatchObject({ gesamt: 4, offen: 2, nichtErforderlich: 1 });
  });
});
