import { describe, expect, it } from "vitest";
import { mietStatus, monateSeitErhoehung, ueberschneiden } from "@/lib/mietverhaeltnis";

describe("Mietverhältnisse", () => {
  it("Status am Stichtag", () => {
    expect(mietStatus({ beginn: "2020-01-01", ende: null }, "2026-11-23")).toBe("aktiv");
    expect(mietStatus({ beginn: "2020-01-01", ende: "2026-11-23" }, "2026-11-23")).toBe("aktiv");
    expect(mietStatus({ beginn: "2020-01-01", ende: "2026-11-22" }, "2026-11-23")).toBe("beendet");
    expect(mietStatus({ beginn: "2027-01-01", ende: null }, "2026-11-23")).toBe("zukuenftig");
  });

  it("Monate seit Mieterhöhung, sonst seit Beginn", () => {
    expect(monateSeitErhoehung({ beginn: "2020-01-01", letzteMieterhoehung: "2025-11-01" }, "2026-11-23")).toBe(12);
    expect(monateSeitErhoehung({ beginn: "2024-05-01", letzteMieterhoehung: null }, "2026-11-23")).toBe(30);
  });

  it("erkennt überschneidende Zeiträume", () => {
    expect(ueberschneiden({ beginn: "2020-01-01", ende: "2024-12-31" }, { beginn: "2025-01-01", ende: null })).toBe(false);
    expect(ueberschneiden({ beginn: "2020-01-01", ende: "2025-01-01" }, { beginn: "2025-01-01", ende: null })).toBe(true);
    expect(ueberschneiden({ beginn: "2020-01-01", ende: null }, { beginn: "2030-01-01", ende: null })).toBe(true);
  });
});
