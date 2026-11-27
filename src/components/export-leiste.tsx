"use client";

import Decimal from "decimal.js";
import { useState } from "react";
import { blattName, dateiName, zellwert } from "@/lib/export";

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

/** Excel-Export der aktuellen Ansicht (alle Tabellen und Kennzahl-Kacheln) und PDF über den Druckdialog. */
export function ExportLeiste({ texte }: { texte: Texte }) {
  const [laeuft, setLaeuft] = useState(false);

  async function excel() {
    const inhalt = document.getElementById("inhalt");
    if (!inhalt) return;
    setLaeuft(true);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const mappe = new ExcelJS.Workbook();
      mappe.created = new Date();
      const seitenTitel = inhalt.querySelector("h1")?.textContent?.trim() || document.title;
      const vergeben = new Set<string>();

      // Infoblatt: was, wann, welche Ansicht und Filter
      const info = mappe.addWorksheet(blattName(texte.info, vergeben));
      const ansicht = document.querySelector("[data-ansicht]")?.textContent?.trim() ?? "";
      const filter = Array.from(inhalt.querySelectorAll("[data-reiter] [aria-current]")).map((a) => a.textContent?.trim()).filter(Boolean).join(" · ");
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
      const kacheln = Array.from(inhalt.querySelectorAll("[data-kachel]"));
      if (kacheln.length > 0) {
        const blatt = mappe.addWorksheet(blattName(texte.kennzahlen, vergeben));
        blatt.addRow([texte.titel, texte.wert, texte.zusatz, texte.quellen]).font = { bold: true };
        for (const k of kacheln) {
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

      // Tabellen
      // Zugeklappte Bereiche mit Tabellen kurz öffnen, damit der Text wie angezeigt gelesen wird
      const zu = Array.from(inhalt.querySelectorAll("details:not([open])")).filter((d) => d.querySelector("table")) as HTMLDetailsElement[];
      zu.forEach((d) => (d.open = true));
      try {
        // Tabellen mit derselben Überschrift landen untereinander auf einem Blatt
        const tabellen = Array.from(inhalt.querySelectorAll("table"));
        const blaetter = new Map<string, { blatt: import("exceljs").Worksheet; breiten: number[] }>();
        tabellen.forEach((tabelle, n) => {
          const ueberschrift = tabelle.closest("section")?.querySelector("h2")?.textContent?.trim() || (tabellen.length === 1 ? seitenTitel : `${seitenTitel} ${n + 1}`);
          let ziel = blaetter.get(ueberschrift);
          if (!ziel) {
            ziel = {
              blatt: mappe.addWorksheet(blattName(ueberschrift, vergeben), { views: [{ state: "frozen", ySplit: tabelle.tHead ? tabelle.tHead.rows.length : 0 }] }),
              breiten: [],
            };
            blaetter.set(ueberschrift, ziel);
          } else {
            ziel.blatt.addRow([]);
          }
          const { blatt, breiten } = ziel;
          const gruppe = tabelle.closest("details")?.querySelector("summary");
          if (gruppe) blatt.addRow([sichtbarerText(gruppe)]).font = { bold: true, italic: true };
          const htmlZeilen = Array.from(tabelle.rows);
          leseTabelle(tabelle, texte).forEach((zellen, index) => {
            const zeile = blatt.addRow([]);
            zellen.forEach((z, i) => {
              const zelle = zeile.getCell(i + 1);
              let notiz = z.notiz;
              if (z.kopf) {
                zelle.value = z.text;
                zelle.font = { bold: true };
              } else notiz = [schreibe(zelle, z.text), z.notiz].filter(Boolean).join("\n");
              if (notiz) zelle.note = notiz;
              breiten[i] = Math.max(breiten[i] ?? 8, Math.min(60, ...z.text.split("\n").map((l) => l.length + 2)));
            });
            if (htmlZeilen[index].parentElement?.tagName === "TFOOT") zeile.font = { bold: true };
          });
          breiten.forEach((w, i) => (blatt.getColumn(i + 1).width = w));
        });
      } finally {
        zu.forEach((d) => (d.open = false));
      }

      const puffer = await mappe.xlsx.writeBuffer();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([puffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      link.download = dateiName(seitenTitel, new Date().toISOString().slice(0, 10), "xlsx");
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    } catch (fehler) {
      console.error("Excel-Export fehlgeschlagen", fehler);
    } finally {
      setLaeuft(false);
    }
  }

  const knopf = "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60";
  return (
    <div className="flex gap-2" data-nicht-drucken>
      <button type="button" className={knopf} onClick={excel} disabled={laeuft} title={texte.excelTitel}>
        {laeuft ? texte.laeuft : texte.excel}
      </button>
      <button type="button" className={knopf} onClick={() => window.print()} title={texte.pdfTitel}>
        {texte.pdf}
      </button>
    </div>
  );
}
