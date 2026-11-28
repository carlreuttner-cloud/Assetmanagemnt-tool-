import { describe, expect, it } from "vitest";
import { texte } from "@/i18n";
import { darf } from "@/lib/auth/rechte";
import { filterHref } from "@/lib/filter";
import { NAVIGATION, aktiverReiter, erlaubteNavigation } from "@/lib/navigation";

const t = texte();

describe("Navigation", () => {
  const alle = erlaubteNavigation(() => true);

  it("hat für jede Gruppe und jeden Reiter einen Text und eindeutige Pfade", () => {
    const pfade = NAVIGATION.flatMap((g) => g.reiter.map((r) => r.pfad));
    expect(new Set(pfade).size).toBe(pfade.length);
    for (const g of NAVIGATION) {
      expect(t.navigationGruppen[g.schluessel]).toBeTruthy();
      for (const r of g.reiter) expect(t.navigation[r.textSchluessel]).toBeTruthy();
    }
  });

  it("findet den Reiter über den längsten passenden Pfad", () => {
    expect(aktiverReiter(alle, "/")?.reiter.pfad).toBe("/");
    expect(aktiverReiter(alle, "/gesellschaften/abc")?.reiter.pfad).toBe("/gesellschaften");
    expect(aktiverReiter(alle, "/gesellschaften/kredite/abc")?.reiter.pfad).toBe("/kredite");
    expect(aktiverReiter(alle, "/gesellschaften/referenzzinsen")?.gruppe.schluessel).toBe("finanzierung");
    expect(aktiverReiter(alle, "/haeuser/einheiten/x")?.reiter.pfad).toBe("/einheiten");
    expect(aktiverReiter(alle, "/haeuser/x")?.reiter.pfad).toBe("/haeuser");
    expect(aktiverReiter(alle, "/portfolios/p1")?.reiter.pfad).toBe("/portfolios");
    // kein Präfix-Treffer über Wortgrenzen hinweg
    expect(aktiverReiter(alle, "/haeuserx")?.reiter.pfad).not.toBe("/haeuser");
  });

  it("filtert Reiter nach Rolle und lässt leere Gruppen weg", () => {
    const hv = erlaubteNavigation((b) => darf("HAUSVERWALTUNG", b));
    expect(hv.map((g) => g.schluessel)).toEqual(["dokumente"]);
    expect(hv[0].reiter.map((r) => r.pfad)).toEqual(["/import"]);
    const investor = erlaubteNavigation((b) => darf("INVESTOR", b)).flatMap((g) => g.reiter.map((r) => r.pfad));
    expect(investor).toEqual(["/portal"]);
  });
});

describe("Filter-Links", () => {
  it("setzt und entfernt Parameter und behält die übrigen", () => {
    expect(filterHref("/kredite", { g: "a", zins: undefined }, "zins", "FEST")).toBe("/kredite?g=a&zins=FEST");
    expect(filterHref("/kredite", { g: "a", zins: "FEST" }, "g", undefined)).toBe("/kredite?zins=FEST");
    expect(filterHref("/kredite", {}, "g", undefined)).toBe("/kredite");
  });
});
