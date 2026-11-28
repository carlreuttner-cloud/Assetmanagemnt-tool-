"use client";

import Decimal from "decimal.js";
import { useEffect, useState } from "react";
import { exportAuswahlPruefen, type KiPruefErgebnis } from "@/app/(app)/export/aktionen";
import { blattName, dateiName, zellwert } from "@/lib/export";
import { abkuerzungenIn, alleAn, auswahlBeschreibung, pruefeAuswahl, type AuswahlTexte, type ExportAuswahl, type ExportTabelleInfo } from "@/lib/export-auswahl";

type Texte = {
  excel: string;
  pdf: string;
  excelTitel: string;
  pdfTitel: string;
  laeuft: string;
  info: string;
  ansicht: string;
  adresse: string;
  exportiertAm: string;
  hinweis: string;
  kennzahlen: string;
  titel: string;
  wert: string;
  zusatz: string;
  quellen: string;
  monat: string;
  jahr: string;
  /** Abkürzung → Erklärung (für das Glossar-Blatt und die Prüfung) */
  glossar: Record<string, string>;
  auswahl: {
    titel: string;
    beschreibung: string;
    kacheln: string;
    spalten: string;
    zeilen: string;
    spalte: string;
    spaltenWaehlen: string;
    alle: string;
    keine: string;
    glossar: string;
    glossarHinweis: string;
    glossarBlatt: string;
    begriff: string;
    erklaerung: string;
    pruefung: string;
    regelOk: string;
    kiPruefen: string;
    kiLaeuft: string;
    kiDatenschutz: string;
    kiOk: string;
    kiPraefix: string;
    kiFehler: string;
    abbrechen: string;
    exportieren: string;
    regeln: AuswahlTexte;
  };
};

/** Zelltext so, wie er angezeigt wird, ohne ⓘ, Bildschirmleser-Texte und Quellenzeilen. */
function sichtbarerText(el: Element): string {
  const weg = new Set(
    Array.from(el.querySelectorAll('.sr-only, [aria-hidden="true"], .quellen-info > *'))
      .map((x) => x.textContent?.trim())
      .filter(Boolean),
  );
  return (el as HTMLElement).innerText
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((z) => z.trim())
    .filter((z) => z && !weg.has(z))
    .join("\n");
}

/** Stichtag- und Quellenangaben innerhalb eines Elements (auch wenn ausgeblendet). */
function quellenText(el: Element): string {
  return Array.from(el.querySelectorAll(".quellen-info"))
    .map((q) => Array.from(q.children).map((z) => z.textContent?.trim()).filter(Boolean).join("\n"))
    .filter(Boolean)
    .join("\n");
}

type Zelle = { text: string; notiz: string; kopf: boolean };

/** Liest eine HTML-Tabelle als Raster; Zellen mit Monat/Jahr (data-teile) werden in zwei Spalten geteilt. */
function leseTabelle(tabelle: HTMLTableElement, texte: Texte): Zelle[][] {
  const zeilen = Array.from(tabelle.rows);
  // Je logischer Spalte: wird sie geteilt?
  const geteilt = new Map<number, number>();
  const raster = zeilen.map((tr) => {
    const ausgabe: Array<{ zelle: HTMLTableCellElement; spalte: number }> = [];
    let spalte = 0;
    for (const zelle of Array.from(tr.cells)) {
      ausgabe.push({ zelle, spalte });
      const teile = zelle.querySelector("[data-teile]");
      if (teile && zelle.colSpan === 1) geteilt.set(spalte, Math.max(geteilt.get(spalte) ?? 1, teile.querySelectorAll("[data-teil]").length));
      spalte += zelle.colSpan;
    }
    return ausgabe;
  });
  const breite = (s: number) => geteilt.get(s) ?? 1;
  return raster.map((zellen) => {
    const ergebnis: Zelle[] = [];
    for (const { zelle, spalte } of zellen) {
      const kopf = zelle.tagName === "TH";
      const notiz = quellenText(zelle);
      const ziel = Array.from({ length: zelle.colSpan }, (_, i) => breite(spalte + i)).reduce((a, b) => a + b, 0);
      const teile = zelle.querySelector("[data-teile]");
      if (kopf && breite(spalte) > 1) {
        const text = sichtbarerText(zelle).replace(/\s*\((Monat|Jahr) \/ (Monat|Jahr)\)\s*$/i, "");
        ergebnis.push({ text: `${text} – ${texte.monat}`, notiz, kopf }, { text: `${text} – ${texte.jahr}`, notiz: "", kopf });
        for (let i = 2; i < ziel; i++) ergebnis.push({ text: "", notiz: "", kopf });
      } else if (teile && ziel > 1) {
        const werte = Array.from(teile.querySelectorAll("[data-teil]")).map((t) => sichtbarerText(t));
        for (let i = 0; i < ziel; i++) ergebnis.push({ text: werte[i] ?? "", notiz: i === 0 ? notiz : "", kopf });
      } else {
        ergebnis.push({ text: sichtbarerText(zelle), notiz, kopf });
        for (let i = 1; i < ziel; i++) ergebnis.push({ text: "", notiz: "", kopf });
      }
    }
    return ergebnis;
  });
}

type Tabelle = { info: ExportTabelleInfo; raster: Zelle[][]; fuss: boolean[]; kopfZeilen: number; gruppe: string | null };
type Modell = { seitenTitel: string; kacheln: Element[]; kachelTitel: string[]; tabellen: Tabelle[] };

/** Liest die Ansicht: Kacheln und Tabellen mit ihren Excel-Spalten (Monat/Jahr schon aufgeteilt). */
function leseAnsicht(inhalt: HTMLElement, texte: Texte): Modell {
  const seitenTitel = inhalt.querySelector("h1")?.textContent?.trim() || document.title;
  const kacheln = Array.from(inhalt.querySelectorAll("[data-kachel]"));
  const kachelTitel = kacheln.map((k) => k.querySelector("[data-kachel-titel]")?.textContent?.trim() ?? "");
  // Zugeklappte Bereiche mit Tabellen kurz öffnen, damit der Text wie angezeigt gelesen wird;
  // Großschreibung per CSS (Spaltenköpfe) beim Lesen aufheben, damit „Soll-Miete“ nicht „SOLL-MIETE“ wird.
  const zu = Array.from(inhalt.querySelectorAll("details:not([open])")).filter((d) => d.querySelector("table")) as HTMLDetailsElement[];
  zu.forEach((d) => (d.open = true));
  const stil = document.createElement("style");
  stil.textContent = "#inhalt th, #inhalt th * { text-transform: none !important; }";
  document.head.appendChild(stil);
  try {
    const elemente = Array.from(inhalt.querySelectorAll("table"));
    const tabellen = elemente.map((tabelle, n): Tabelle => {
      const blatt = tabelle.closest("section")?.querySelector("h2")?.textContent?.trim() || (elemente.length === 1 ? seitenTitel : `${seitenTitel} ${n + 1}`);
      const raster = leseTabelle(tabelle, texte);
      const htmlZeilen = Array.from(tabelle.rows);
      const kopfZeilen = tabelle.tHead ? tabelle.tHead.rows.length : 0;
      const breite = Math.max(0, ...raster.map((z) => z.length));
      const kopf = raster.slice(0, Math.max(1, kopfZeilen));
      const spalten = Array.from({ length: breite }, (_, i) => {
        for (let r = kopf.length - 1; r >= 0; r--) if (kopf[r][i]?.text) return kopf[r][i].text.replace(/\s+/g, " ");
        return `${texte.auswahl.spalte} ${i + 1}`;
      });
      return {
        info: { id: `t${n}`, blatt, spalten },
        raster,
        fuss: htmlZeilen.map((r) => r.parentElement?.tagName === "TFOOT"),
        kopfZeilen,
        gruppe: tabelle.closest("details")?.querySelector("summary") ? sichtbarerText(tabelle.closest("details")!.querySelector("summary")!) : null,
      };
    });
    return { seitenTitel, kacheln, kachelTitel, tabellen };
  } finally {
    stil.remove();
    zu.forEach((d) => (d.open = false));
  }
}

/**
 * Excel-Export der aktuellen Ansicht und PDF über den Druckdialog. Vor dem Excel-Export wählt
 * man Kennzahlen, Tabellen und Spalten; Regeln prüfen die Auswahl sofort, die KI auf Wunsch.
 */
export function ExportLeiste({ texte, ki }: { texte: Texte; ki: { erlaubt: boolean } }) {
  const [laeuft, setLaeuft] = useState(false);
  const [modell, setModell] = useState<Modell | null>(null);
  const [auswahl, setAuswahl] = useState<ExportAuswahl | null>(null);
  const [kiStand, setKiStand] = useState<{ laeuft: boolean; ergebnis: KiPruefErgebnis | null }>({ laeuft: false, ergebnis: null });
  const ta = texte.auswahl;
  const begriffe = Object.keys(texte.glossar);
  // Für die Regelprüfung nur echte Abkürzungen (LTV, DSCR …), nicht jedes Fachwort
  const abkuerzungen = begriffe.filter((b) => /^[A-ZÄÖÜ]{2,6}$/.test(b));

  function oeffnen() {
    const inhalt = document.getElementById("inhalt");
    if (!inhalt) return;
    const m = leseAnsicht(inhalt, texte);
    setModell(m);
    setAuswahl(alleAn(m.tabellen.map((x) => x.info), m.kacheln.length > 0));
    setKiStand({ laeuft: false, ergebnis: null });
  }
  const schliessen = () => {
    setModell(null);
    setAuswahl(null);
  };
  // Esc schließt den Auswahldialog
  useEffect(() => {
    if (!modell) return;
    const taste = (e: KeyboardEvent) => e.key === "Escape" && schliessen();
    document.addEventListener("keydown", taste);
    return () => document.removeEventListener("keydown", taste);
  }, [modell]);

  const regelHinweise = modell && auswahl ? pruefeAuswahl(modell.tabellen.map((x) => x.info), modell.kachelTitel, auswahl, abkuerzungen, ta.regeln) : [];
  const nichtsGewaehlt = !!auswahl && !auswahl.kacheln && !Object.values(auswahl.tabellen).some((x) => x.an && x.spalten.some(Boolean));

  async function kiPruefen() {
    if (!modell || !auswahl) return;
    setKiStand({ laeuft: true, ergebnis: null });
    try {
      const ergebnis = await exportAuswahlPruefen(auswahlBeschreibung(modell.seitenTitel, modell.tabellen.map((x) => x.info), modell.kachelTitel, auswahl));
      setKiStand({ laeuft: false, ergebnis });
    } catch {
      setKiStand({ laeuft: false, ergebnis: { status: "fehler", meldung: ta.kiFehler } });
    }
  }

  async function excel() {
    if (!modell || !auswahl) return;
    setLaeuft(true);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const mappe = new ExcelJS.Workbook();
      mappe.created = new Date();
      const { seitenTitel } = modell;
      const vergeben = new Set<string>();
      const inhalt = document.getElementById("inhalt");

      // Infoblatt: was, wann, welche Ansicht und Filter
      const info = mappe.addWorksheet(blattName(texte.info, vergeben));
      const ansicht = document.querySelector("[data-ansicht]")?.textContent?.trim() ?? "";
      const filter = inhalt
        ? [
            ...Array.from(inhalt.querySelectorAll("[data-reiter] [aria-current]")).map((a) => a.textContent?.trim()),
            ...Array.from(inhalt.querySelectorAll("[data-auswahl-filter] select")).map((x) => (x as HTMLSelectElement).selectedOptions[0]?.textContent?.trim()),
          ]
            .filter(Boolean)
            .join(" · ")
        : "";
      info.addRows([
        [texte.titel, seitenTitel],
        [texte.ansicht, [ansicht, filter].filter(Boolean).join(" · ")],
        [texte.adresse, window.location.href],
        [texte.exportiertAm, new Date()],
        [],
        [texte.hinweis],
      ]);
      info.getColumn(1).width = 22;
      info.getColumn(2).width = 80;
      info.getCell("B4").numFmt = "dd.mm.yyyy hh:mm";
      info.getColumn(1).font = { bold: true };

      /** Schreibt den Wert; bei „Zahl + Zusatzzeilen“ (z. B. „Stand 31.10.2026“) wird der Zusatz zur Notiz. */
      const schreibe = (zelle: import("exceljs").Cell, text: string): string => {
        const zeilen = text.split("\n");
        let w = zellwert(text);
        let zusatz = "";
        if (w.typ === "text" && zeilen.length > 1) {
          const erste = zellwert(zeilen[0]);
          if (erste.typ !== "text" && zeilen.slice(1).every((z) => zellwert(z).typ === "text")) {
            w = erste;
            zusatz = zeilen.slice(1).join("\n");
          }
        }
        if (w.typ === "zahl") {
          zelle.value = new Decimal(w.dezimal).toNumber(); // erst die Excel-Zelle ist eine Gleitkommazahl
          zelle.numFmt = w.format;
        } else if (w.typ === "datum") {
          zelle.value = new Date(`${w.iso}T00:00:00Z`);
          zelle.numFmt = "dd.mm.yyyy";
        } else {
          zelle.value = w.text;
          if (w.text.includes("\n")) zelle.alignment = { wrapText: true, vertical: "top" };
        }
        return zusatz;
      };

      // Kennzahl-Kacheln
      if (auswahl.kacheln && modell.kacheln.length > 0) {
        const blatt = mappe.addWorksheet(blattName(texte.kennzahlen, vergeben));
        blatt.addRow([texte.titel, texte.wert, texte.zusatz, texte.quellen]).font = { bold: true };
        for (const k of modell.kacheln) {
          const zeile = blatt.addRow([]);
          zeile.getCell(1).value = k.querySelector("[data-kachel-titel]")?.textContent?.trim() ?? "";
          const wert = k.querySelector("[data-kachel-wert]");
          const zusatz = schreibe(zeile.getCell(2), wert ? sichtbarerText(wert) : "");
          const unter = k.querySelector("[data-kachel-unter]");
          zeile.getCell(3).value = [zusatz, unter ? sichtbarerText(unter) : ""].filter(Boolean).join("\n");
          zeile.getCell(4).value = quellenText(k);
          zeile.getCell(4).alignment = { wrapText: true, vertical: "top" };
        }
        blatt.columns.forEach((s, i) => (s.width = [36, 20, 50, 60][i]));
      }

      // Tabellen: nur gewählte, nur gewählte Spalten. Gleiche Überschrift → ein Blatt.
      const blaetter = new Map<string, { blatt: import("exceljs").Worksheet; breiten: number[] }>();
      const gewaehlteTexte: string[] = auswahl.kacheln ? [...modell.kachelTitel] : [];
      for (const tab of modell.tabellen) {
        const a = auswahl.tabellen[tab.info.id];
        if (!a?.an) continue;
        const indizes = tab.info.spalten.map((_, i) => i).filter((i) => a.spalten[i]);
        if (indizes.length === 0) continue;
        indizes.forEach((i) => gewaehlteTexte.push(tab.info.spalten[i]));
        let ziel = blaetter.get(tab.info.blatt);
        if (!ziel) {
          ziel = { blatt: mappe.addWorksheet(blattName(tab.info.blatt, vergeben), { views: [{ state: "frozen", ySplit: tab.kopfZeilen }] }), breiten: [] };
          blaetter.set(tab.info.blatt, ziel);
        } else {
          ziel.blatt.addRow([]);
        }
        const { blatt, breiten } = ziel;
        if (tab.gruppe) blatt.addRow([tab.gruppe]).font = { bold: true, italic: true };
        tab.raster.forEach((zellen, index) => {
          const zeile = blatt.addRow([]);
          indizes.forEach((quelle, i) => {
            const z = zellen[quelle] ?? { text: "", notiz: "", kopf: false };
            const zelle = zeile.getCell(i + 1);
            let notiz = z.notiz;
            if (z.kopf) {
              zelle.value = z.text;
              zelle.font = { bold: true };
            } else notiz = [schreibe(zelle, z.text), z.notiz].filter(Boolean).join("\n");
            if (notiz) zelle.note = notiz;
            breiten[i] = Math.max(breiten[i] ?? 8, Math.min(60, ...z.text.split("\n").map((l) => l.length + 2)));
          });
          if (tab.fuss[index]) zeile.font = { bold: true };
        });
        breiten.forEach((w, i) => (blatt.getColumn(i + 1).width = w));
      }

      // Glossar: erklärt die Abkürzungen der gewählten Inhalte (oder alle, wenn keine vorkommen)
      if (auswahl.glossar) {
        const gefunden = abkuerzungenIn(gewaehlteTexte, begriffe);
        const blatt = mappe.addWorksheet(blattName(ta.glossarBlatt, vergeben));
        blatt.addRow([ta.begriff, ta.erklaerung]).font = { bold: true };
        for (const b of gefunden.length ? gefunden : begriffe) blatt.addRow([b, texte.glossar[b]]);
        blatt.getColumn(1).width = 18;
        blatt.getColumn(2).width = 100;
        blatt.getColumn(2).alignment = { wrapText: true, vertical: "top" };
      }

      const puffer = await mappe.xlsx.writeBuffer();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([puffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      link.download = dateiName(seitenTitel, new Date().toISOString().slice(0, 10), "xlsx");
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10000);
      schliessen();
    } catch (fehler) {
      console.error("Excel-Export fehlgeschlagen", fehler);
    } finally {
      setLaeuft(false);
    }
  }

  const setzeTabelle = (id: string, aenderung: (x: { an: boolean; spalten: boolean[] }) => { an: boolean; spalten: boolean[] }) =>
    setAuswahl((a) => (a ? { ...a, tabellen: { ...a.tabellen, [id]: aenderung(a.tabellen[id]) } } : a));

  const knopf = "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60";
  const hinweisFarbe = (art: "warnung" | "hinweis") => (art === "warnung" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-700");
  return (
    <div className="flex gap-2" data-nicht-drucken>
      <button type="button" className={knopf} onClick={oeffnen} disabled={laeuft} title={texte.excelTitel}>
        {laeuft ? texte.laeuft : texte.excel}
      </button>
      <button type="button" className={knopf} onClick={() => window.print()} title={texte.pdfTitel}>
        {texte.pdf}
      </button>

      {modell && auswahl && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-10" role="presentation" onClick={schliessen}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-auswahl-titel"
            data-export-auswahl
            className="w-full max-w-3xl rounded-xl bg-white p-6 text-sm shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="export-auswahl-titel" className="text-lg font-semibold text-slate-900">
              {ta.titel}
            </h2>
            <p className="mt-1 text-slate-600">{ta.beschreibung}</p>

            <div className="mt-4 space-y-2">
              {modell.kacheln.length > 0 && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={auswahl.kacheln} onChange={(e) => setAuswahl({ ...auswahl, kacheln: e.target.checked })} />
                  <span className="font-medium">{texte.kennzahlen}</span>
                  <span className="text-xs text-slate-500">
                    ({modell.kacheln.length} {ta.kacheln})
                  </span>
                </label>
              )}
              {modell.tabellen.map((tab) => {
                const a = auswahl.tabellen[tab.info.id];
                const anzahl = a.spalten.filter(Boolean).length;
                const datenZeilen = tab.raster.length - tab.kopfZeilen;
                return (
                  <div key={tab.info.id} className="rounded-lg border border-slate-200 p-3" data-export-tabelle={tab.info.blatt}>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={a.an} onChange={(e) => setzeTabelle(tab.info.id, (x) => ({ ...x, an: e.target.checked }))} />
                      <span className="font-medium">
                        {tab.info.blatt}
                        {tab.gruppe ? ` · ${tab.gruppe}` : ""}
                      </span>
                      <span className="text-xs text-slate-500">
                        ({anzahl}/{tab.info.spalten.length} {ta.spalten}, {datenZeilen} {ta.zeilen})
                      </span>
                    </label>
                    {a.an && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-slate-600">{ta.spaltenWaehlen}</summary>
                        <div className="mt-2 flex gap-3 text-xs">
                          <button type="button" className="text-slate-600 underline" onClick={() => setzeTabelle(tab.info.id, (x) => ({ ...x, spalten: x.spalten.map(() => true) }))}>
                            {ta.alle}
                          </button>
                          <button type="button" className="text-slate-600 underline" onClick={() => setzeTabelle(tab.info.id, (x) => ({ ...x, spalten: x.spalten.map(() => false) }))}>
                            {ta.keine}
                          </button>
                        </div>
                        <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                          {tab.info.spalten.map((name, i) => (
                            <label key={i} className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={a.spalten[i]}
                                onChange={(e) => setzeTabelle(tab.info.id, (x) => ({ ...x, spalten: x.spalten.map((w, j) => (j === i ? e.target.checked : w)) }))}
                              />
                              {name}
                            </label>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                );
              })}
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={auswahl.glossar} onChange={(e) => setAuswahl({ ...auswahl, glossar: e.target.checked })} />
                <span className="font-medium">{ta.glossar}</span>
                <span className="text-xs text-slate-500">{ta.glossarHinweis}</span>
              </label>
            </div>

            <div className="mt-4 space-y-2" aria-live="polite">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ta.pruefung}</h3>
              {regelHinweise.length === 0 ? (
                <p className="text-xs text-emerald-800">{ta.regelOk}</p>
              ) : (
                <ul className="space-y-1">
                  {regelHinweise.map((h, i) => (
                    <li key={i} className={`rounded border px-2 py-1 text-xs ${hinweisFarbe(h.art)}`}>
                      {h.text}
                    </li>
                  ))}
                </ul>
              )}
              {ki.erlaubt && (
                <div className="pt-1">
                  <button type="button" className={knopf} onClick={kiPruefen} disabled={kiStand.laeuft || nichtsGewaehlt}>
                    {kiStand.laeuft ? ta.kiLaeuft : ta.kiPruefen}
                  </button>
                  <span className="ml-2 text-xs text-slate-500">{ta.kiDatenschutz}</span>
                  {kiStand.ergebnis?.status === "fehler" && <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">{kiStand.ergebnis.meldung}</p>}
                  {kiStand.ergebnis?.status === "ok" && (
                    <div className="mt-2">
                      {kiStand.ergebnis.hinweise.length === 0 ? (
                        <p className="text-xs text-emerald-800">{ta.kiOk}</p>
                      ) : (
                        <ul className="space-y-1">
                          {kiStand.ergebnis.hinweise.map((h, i) => (
                            <li key={i} className={`rounded border px-2 py-1 text-xs ${hinweisFarbe(h.art)}`}>
                              {ta.kiPraefix} {h.text}
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="mt-1 text-[11px] text-slate-500">{kiStand.ergebnis.quelle}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50" onClick={schliessen}>
                {ta.abbrechen}
              </button>
              <button type="button" className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-700 disabled:opacity-50" onClick={excel} disabled={laeuft || nichtsGewaehlt} data-export-start>
                {laeuft ? texte.laeuft : ta.exportieren}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
