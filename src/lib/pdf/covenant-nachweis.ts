/**
 * PDF des Covenant-Nachweises aus dem eingefrorenen Inhalt (`NachweisInhalt`).
 */
import "server-only";
import { DUNKEL, GRUEN, ROT, GRAU, fusszeilen, neuesPdf } from "./schreiber";
import { fuelle, type Texte } from "@/i18n";
import { alsDezimal, gesamtErgebnis, type NachweisInhalt } from "@/lib/covenant-nachweis";
import type { Formatierer } from "@/lib/format";
import { dezimal } from "@/lib/geld";

export async function covenantNachweisPdf(inhalt: NachweisInhalt, t: Texte, f: Formatierer): Promise<Uint8Array> {
  const tp = t.covenantNachweis.pdf;
  const { doc, s, normal } = await neuesPdf(`${t.covenantNachweis.titel} ${inhalt.kredit.bezeichnung} ${f.datum(inhalt.stichtag)}`, new Date(inhalt.erstelltAm));
  const unbekannt = tp.unbekannt;
  const betrag = (x: string | null) => (x === null ? unbekannt : f.betrag(dezimal(x)));
  const istProzent = (k: string) => k.trim().toUpperCase() === "LTV";
  const kennzahl = (k: string, x: string | null) => (x === null ? unbekannt : istProzent(k) ? f.prozent(alsDezimal(x), 2) : f.faktor(alsDezimal(x), 2));

  s.text(inhalt.mandant, { groesse: 9, farbe: GRAU });
  s.text(t.covenantNachweis.titel, { groesse: 18, fett: true });
  s.text(fuelle(tp.untertitel, { datum: f.datum(inhalt.stichtag) }), { groesse: 11, abstand: 8 });
  s.tabelle(
    [
      { titel: tp.kredit, breite: 3 },
      { titel: tp.bank, breite: 2 },
      { titel: tp.kreditnummer, breite: 1.5 },
      { titel: tp.gesellschaft, breite: 2.5 },
      { titel: tp.stichtag, breite: 1.2 },
    ],
    [[{ text: inhalt.kredit.bezeichnung }, { text: inhalt.kredit.bank ?? "–" }, { text: inhalt.kredit.kreditnummer ?? "–" }, { text: inhalt.kredit.gesellschaft }, { text: f.datum(inhalt.stichtag) }]],
  );
  const erstellt = f.datumZeit(new Date(inhalt.erstelltAm));
  s.text(inhalt.erstelltVon ? fuelle(tp.erstellt, { datum: erstellt, name: inhalt.erstelltVon }) : fuelle(tp.erstelltOhne, { datum: erstellt }), { groesse: 8.5, farbe: GRAU });

  const ergebnis = gesamtErgebnis(inhalt);
  s.y -= 6;
  s.text(`${tp.ergebnis}: ${t.covenantNachweis.ergebnis[ergebnis]}`, { groesse: 12, fett: true, farbe: ergebnis === "verletzt" ? ROT : ergebnis === "eingehalten" ? GRUEN : DUNKEL });

  s.ueberschrift(tp.covenants);
  s.tabelle(
    [
      { titel: tp.spalten.art, breite: 2.1 },
      { titel: tp.spalten.kennzahl, breite: 2.3 },
      { titel: tp.spalten.bedingung, breite: 1.8 },
      { titel: tp.spalten.ist, breite: 1.3, rechts: true },
      { titel: tp.spalten.puffer, breite: 1.3, rechts: true },
      { titel: tp.spalten.status, breite: 1.4 },
    ],
    inhalt.covenants.map((c) => {
      const status = c.eingehalten === null ? "offen" : c.eingehalten ? "eingehalten" : "verletzt";
      return [
        { text: t.kredite.folgen[c.folge] },
        { text: c.beschreibung ? `${c.kennzahl} – ${c.beschreibung}` : c.kennzahl },
        { text: c.vergleich && c.schwellenwert !== null ? `${t.vergleiche[c.vergleich]} ${kennzahl(c.kennzahl, c.schwellenwert)}` : "–" },
        { text: kennzahl(c.kennzahl, c.wert) },
        { text: c.abstand === null ? "–" : istProzent(c.kennzahl) ? `${f.zahl(alsDezimal(c.abstand), 2)} %-P.` : f.faktor(alsDezimal(c.abstand), 2) },
        { text: tp.status[status], fett: true, farbe: status === "verletzt" ? ROT : status === "eingehalten" ? GRUEN : DUNKEL },
      ];
    }),
  );

  s.ueberschrift(tp.herleitung);
  for (const formel of tp.formeln) s.text(`• ${formel}`, { groesse: 9 });
  s.y -= 4;
  s.tabelle(
    [
      { titel: tp.summen, breite: 3 },
      { titel: "", breite: 2, rechts: true },
    ],
    (Object.keys(tp.werte) as Array<keyof typeof tp.werte>).map((k) => [{ text: tp.werte[k] }, { text: betrag(inhalt.summen[k]) }]).concat([
      [{ text: "LTV" }, { text: kennzahl("LTV", inhalt.kennzahlen.LTV) }],
      [{ text: "DSCR" }, { text: kennzahl("DSCR", inhalt.kennzahlen.DSCR) }],
      [{ text: "ICR" }, { text: kennzahl("ICR", inhalt.kennzahlen.ICR) }],
    ]),
  );

  s.ueberschrift(tp.haeuser);
  s.tabelle(
    [
      { titel: tp.spaltenHaus.haus, breite: 3 },
      { titel: tp.spaltenHaus.verkehrswert, breite: 2, rechts: true },
      { titel: tp.spaltenHaus.stand, breite: 1.3 },
      { titel: tp.spaltenHaus.quelle, breite: 2.2 },
      { titel: tp.spaltenHaus.miete, breite: 2, rechts: true },
    ],
    inhalt.haeuser.map((h) => [
      { text: h.bezeichnung },
      { text: h.verkehrswert ? betrag(h.verkehrswert.wert) : unbekannt, farbe: h.verkehrswert ? undefined : ROT },
      { text: h.verkehrswert ? f.datum(h.verkehrswert.stichtag) : "–" },
      { text: h.verkehrswert?.quelle ?? "–" },
      { text: betrag(h.istJahr) },
    ]),
  );

  s.ueberschrift(tp.kredite);
  s.tabelle(
    [
      { titel: tp.spaltenKredit.kredit, breite: 2.8 },
      { titel: tp.spaltenKredit.anteil, breite: 2.2 },
      { titel: tp.spaltenKredit.restschuld, breite: 1.8, rechts: true },
      { titel: tp.spaltenKredit.beleg, breite: 2.2 },
      { titel: tp.spaltenKredit.kapitaldienst, breite: 2.2, rechts: true },
    ],
    inhalt.kredite.map((k) => {
      const anteil = k.anteile.reduce((sum, a) => sum.plus(dezimal(a.prozent)), dezimal(0)).dividedBy(100);
      const rest = k.restschuld;
      const kd = k.kapitaldienst;
      return [
        { text: k.eigener ? `${k.bezeichnung} ${tp.dieserKredit}` : k.bezeichnung, fett: k.eigener },
        { text: k.anteile.map((a) => fuelle(tp.anteilWert, { prozent: f.prozent(dezimal(a.prozent), 0), haus: a.haus })).join(", ") },
        { text: rest ? f.betrag(dezimal(rest.betrag).times(anteil)) : unbekannt, farbe: rest ? undefined : ROT },
        { text: rest ? (rest.herkunft === "nichtAusgezahlt" ? tp.nichtAusgezahlt : `${tp.herkunft[rest.herkunft]} ${f.datum(rest.stichtag)}${rest.quelle ? `, ${(t.saldoQuellen as Record<string, string>)[rest.quelle] ?? rest.quelle}` : ""}${rest.quelleText ? `: ${rest.quelleText}` : ""}`) : "–" },
        {
          text: kd
            ? `${f.betrag(dezimal(kd.zins).plus(dezimal(kd.tilgung)).times(anteil))}\n${kd.quelle === "buchungen" && kd.von && kd.bis ? fuelle(tp.kdBuchungen, { von: f.datum(kd.von), bis: f.datum(kd.bis) }) : tp.kdSchaetzung}`
            : unbekannt,
          farbe: kd ? undefined : ROT,
        },
      ];
    }),
  );

  s.ueberschrift(tp.luecken);
  if (inhalt.luecken.length === 0) s.text(tp.keineLuecken);
  for (const l of inhalt.luecken) s.text(`• ${fuelle(tp.lueckenText[l.art], { objekt: l.objekt })}`, { farbe: l.art === "geschaetzt" ? DUNKEL : ROT });
  s.y -= 8;
  s.text(tp.hinweis, { groesse: 8.5, farbe: GRAU });

  fusszeilen(s, normal, (seite, seiten) => `${t.covenantNachweis.titel} · ${inhalt.kredit.bezeichnung} · ${f.datum(inhalt.stichtag)}    ${fuelle(tp.seite, { seite, seiten })}`);
  return doc.save();
}
