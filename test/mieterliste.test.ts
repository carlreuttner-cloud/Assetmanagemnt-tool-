/**
 * Import von Mieterlisten: Lesen der CSV und Abgleich mit dem Bestand.
 */
import { describe, expect, it } from "vitest";
import { dezimal } from "@/lib/geld";
import { leseMieterliste, planeMieterImport, schreibeMieterliste, type BestandEinheit } from "@/lib/import/mieterliste";

const STAND = "2026-11-15";

function bestand(): BestandEinheit[] {
  const mv = (id: string, name: string, beginn: string, soll: string, extra: Partial<BestandEinheit["mietverhaeltnisse"][number]> = {}) => ({
    id,
    mieterId: `m-${id}`,
    mieterName: name,
    beginn,
    ende: null,
    sollMiete: dezimal(soll),
    istMiete: dezimal(soll),
    rueckstand: dezimal(0),
    rueckstandStichtag: null,
    letzteMieterhoehung: null,
    ...extra,
  });
  return [
    { id: "e1", bezeichnung: "WE 01", art: "WOHNUNG", flaeche: dezimal(60), erwarteteMiete: null, mietverhaeltnisse: [mv("a", "Anna Alt", "2020-01-01", "700")] },
    { id: "e2", bezeichnung: "WE 02", art: "WOHNUNG", flaeche: dezimal(80), erwarteteMiete: null, mietverhaeltnisse: [mv("b", "Bernd Bleibt", "2019-05-01", "900")] },
    { id: "e3", bezeichnung: "WE 03", art: "WOHNUNG", flaeche: dezimal(50), erwarteteMiete: dezimal(600), mietverhaeltnisse: [] },
    { id: "e4", bezeichnung: "Laden", art: "GEWERBE", flaeche: dezimal(120), erwarteteMiete: null, mietverhaeltnisse: [mv("c", "Café GmbH", "2018-01-01", "2400")] },
    { id: "e5", bezeichnung: "WE 05", art: "WOHNUNG", flaeche: dezimal(70), erwarteteMiete: null, mietverhaeltnisse: [mv("d", "Dora Da", "2021-01-01", "800")] },
  ];
}

const KOPF = "Einheit;Art;Fläche (m²);Mieter;Beginn;Ende;Soll-Miete (€/Monat);Ist-Miete (€/Monat);Rückstand (€);Letzte Mieterhöhung";

describe("Mieterliste lesen", () => {
  it("erkennt Spalten auch mit anderen Namen und Einheiten", () => {
    const l = leseMieterliste("Stand: 15.11.2026\n\nWhg-Nr.;Nutzung;Wohnfläche qm;Name;Mietbeginn;Nettokaltmiete EUR\nWE 01;Wohnung;60;Anna Alt;01.01.2020;700,00\n");
    expect(l.fehler).toBeNull();
    expect(l.zeilen).toHaveLength(1);
    expect(l.zeilen[0]).toMatchObject({ einheit: "WE 01", art: "WOHNUNG", mieter: "Anna Alt", beginn: "2020-01-01" });
    expect(l.zeilen[0].sollMiete!.toFixed(2)).toBe("700.00");
  });

  it("behandelt „leer“ als Leerstand und meldet unlesbare Werte", () => {
    const l = leseMieterliste(`${KOPF}\nWE 03;Wohnung;50;leer;;;;;;\nWE 01;Wohnung;60;Anna Alt;01.01.2020;;sieben;;;`);
    expect(l.zeilen[0].mieter).toBeNull();
    expect(l.zeilen[1].fehlerFeld).toBe("sollMiete");
  });

  it("erkennt eine Datei ohne passende Kopfzeile", () => {
    expect(leseMieterliste("a;b\n1;2").fehler).toBe("kopfzeile");
  });
});

describe("Mieterliste abgleichen", () => {
  const opt = { stand: STAND, darfEinheitenPflegen: false } as const;

  it("ist beim erneuten Import der eigenen Liste ohne Änderungen", () => {
    const b = bestand();
    const plan = planeMieterImport(b, leseMieterliste(schreibeMieterliste(b, STAND)), opt);
    expect(plan.zeilen.map((z) => z.aktion)).toEqual(Array(5).fill("unveraendert"));
    expect(plan.fehlendeEinheiten).toEqual([]);
  });

  it("erkennt Änderung, Mieterwechsel, Neuvermietung, Auszug und fehlende Einheiten", () => {
    const csv = [
      KOPF,
      "WE 01;Wohnung;60;Anna Alt;01.01.2020;;750,00;700,00;100,00;01.10.2026",
      "WE 02;Wohnung;80;Clara Neu;01.11.2026;;950,00;;;",
      "WE 03;Wohnung;50;Emil Einzug;01.10.2026;;620,00;620,00;;",
      "Laden;Gewerbe;120;;;31.10.2026;;;;",
    ].join("\n");
    const plan = planeMieterImport(bestand(), leseMieterliste(csv), opt);
    const [we1, we2, we3, laden] = plan.zeilen;

    expect(we1.aktion).toBe("aendern");
    expect(we1.aktualisieren!.aenderungen.map((a) => a.feld)).toEqual(["sollMiete", "rueckstand", "letzteMieterhoehung"]);

    expect(we2.aktion).toBe("mieterwechsel");
    expect(we2.beenden).toEqual({ id: "b", mieterName: "Bernd Bleibt", ende: "2026-10-31" });
    expect(we2.anlegen).toMatchObject({ mieterName: "Clara Neu", beginn: "2026-11-01", sollMiete: "950.00", istMiete: "950.00", rueckstand: "0.00" });

    expect(we3.aktion).toBe("neu");
    expect(laden.aktion).toBe("auszug");
    expect(laden.beenden!.ende).toBe("2026-10-31");
    expect(plan.fehlendeEinheiten).toEqual(["WE 05"]);
  });

  it("legt unbekannte Einheiten nur mit Recht dazu an", () => {
    const csv = `${KOPF}\nWE 09;Wohnung;45;Neu Mieter;01.11.2026;;500;;;`;
    expect(planeMieterImport(bestand(), leseMieterliste(csv), opt).zeilen[0].fehler).toBe("einheitUnbekannt");
    const mitRecht = planeMieterImport(bestand(), leseMieterliste(csv), { ...opt, darfEinheitenPflegen: true }).zeilen[0];
    expect(mitRecht.aktion).toBe("neu");
    expect(mitRecht.neueEinheit).toEqual({ art: "WOHNUNG", flaeche: "45.00" });
  });

  it("meldet fehlenden Beginn, Wechsel vor altem Beginn und doppelte Einheiten", () => {
    const csv = [KOPF, "WE 02;Wohnung;80;Clara Neu;;;950;;;", "WE 01;Wohnung;60;Zoe Früh;01.01.2019;;800;;;", "WE 01;Wohnung;60;Anna Alt;;;700;;;"].join("\n");
    const plan = planeMieterImport(bestand(), leseMieterliste(csv), opt);
    expect(plan.zeilen.map((z) => z.fehler)).toEqual(["beginnFehlt", "wechselVorBeginn", "einheitDoppelt"]);
  });

  it("ändert Fläche nur mit Recht und übernimmt Rückstand zum Stand", () => {
    const csv = `${KOPF}\nWE 01;Wohnung;62;Anna Alt;01.01.2020;;700;700;;`;
    expect(planeMieterImport(bestand(), leseMieterliste(csv), opt).zeilen[0].aktion).toBe("unveraendert");
    const mitRecht = planeMieterImport(bestand(), leseMieterliste(csv), { ...opt, darfEinheitenPflegen: true }).zeilen[0];
    expect(mitRecht.einheitAenderungen).toEqual([{ feld: "flaeche", alt: "60.00", neu: "62.00" }]);
  });
});
