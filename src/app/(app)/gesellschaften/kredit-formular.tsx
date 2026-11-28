import { Formular } from "@/components/formular";
import { Begriff } from "@/components/herleitung";
import { Auswahl, Feld, Felder, Textfeld } from "@/components/ui";
import type { Texte } from "@/i18n";
import type { Formatierer } from "@/lib/format";
import { isoDatum } from "@/lib/datum";
import { kreditSpeichern } from "./aktionen";

type Dez = { toFixed(): string } | null;

export type KreditFormularDaten = {
  id: string;
  gesellschaftId: string;
  bezeichnung: string;
  bank: string | null;
  kreditart: "BANK" | "GESELLSCHAFTERDARLEHEN" | "NACHRANGDARLEHEN";
  rang: number | null;
  gesellschafterId: string | null;
  kreditnummer: string | null;
  iban: string | null;
  ursprungsbetrag: Dez;
  auszahlungsdatum: Date | null;
  zinsArt: "FEST" | "VARIABEL";
  sollzins: Dez;
  referenzzins: string | null;
  marge: Dez;
  zinsbindungBis: Date | null;
  laufzeitBis: Date | null;
  zahlweise: string;
  tilgungsart: string;
  anfaenglicheTilgung: Dez;
  ratenbetrag: Dez;
  notiz: string | null;
  haeuser: { hausId: string; anteilProzent: Dez }[];
};

export function KreditFormular({
  t,
  f,
  kredit,
  gesellschaftId,
  gesellschaften,
  haeuser,
  gesellschafter = [],
}: {
  t: Texte;
  f: Formatierer;
  kredit?: KreditFormularDaten;
  gesellschaftId: string;
  gesellschaften: { id: string; name: string }[];
  haeuser: { id: string; bezeichnung: string }[];
  /** Gesellschafter der Gesellschaft (Darlehensgeber bei Gesellschafterdarlehen) */
  gesellschafter?: { id: string; name: string }[];
}) {
  const k = t.kredite;
  const optionen = <T extends Record<string, string>>(werte: T) => Object.entries(werte).map(([wert, text]) => ({ wert, text }));
  const anteil = (hausId: string) => kredit?.haeuser.find((h) => h.hausId === hausId)?.anteilProzent ?? null;
  return (
    <Formular aktion={kreditSpeichern.bind(null, kredit?.id ?? null)} absenden={t.allgemein.speichern} className="space-y-6">
      <Felder>
        <Feld name="bezeichnung" label={k.bezeichnung} wert={kredit?.bezeichnung} pflicht />
        <Auswahl
          name="gesellschaftId"
          label={k.gesellschaft}
          wert={kredit?.gesellschaftId ?? gesellschaftId}
          optionen={gesellschaften.map((g) => ({ wert: g.id, text: g.name }))}
          pflicht
        />
        <Feld name="bank" label={k.bank} wert={kredit?.bank} />
        <Auswahl name="kreditart" label={<Begriff k="Nachrangdarlehen" t={t}>{k.kreditart}</Begriff>} wert={kredit?.kreditart ?? "BANK"} optionen={optionen(t.kreditarten)} pflicht />
        <Feld name="rang" label={k.rang} typ="number" wert={kredit?.rang != null ? String(kredit.rang) : undefined} hinweis={k.rangHinweis} />
        {gesellschafter.length > 0 && (
          <Auswahl name="gesellschafterId" label={k.darlehensgeber} wert={kredit?.gesellschafterId ?? undefined} optionen={gesellschafter.map((g) => ({ wert: g.id, text: g.name }))} leerText="–" hinweis={k.darlehensgeberHinweis} />
        )}
        <Feld name="kreditnummer" label={k.kreditnummer} wert={kredit?.kreditnummer} />
        <Feld name="iban" label={k.iban} wert={kredit?.iban} />
        <Feld name="ursprungsbetrag" label={k.ursprungsbetrag} wert={f.eingabe(kredit?.ursprungsbetrag, 2)} inputMode="decimal" pflicht />
        <Feld name="auszahlungsdatum" label={k.auszahlungsdatum} typ="date" wert={isoDatum(kredit?.auszahlungsdatum)} />
        <Feld name="laufzeitBis" label={k.laufzeitBis} typ="date" wert={isoDatum(kredit?.laufzeitBis)} />
      </Felder>

      <Felder>
        <Auswahl name="zinsArt" label={k.zinsArt} wert={kredit?.zinsArt ?? "FEST"} optionen={optionen(t.zinsArten)} pflicht />
        <Feld name="sollzins" label={k.sollzins} wert={f.eingabe(kredit?.sollzins)} inputMode="decimal" hinweis={t.zinsArten.FEST} />
        <Feld name="zinsbindungBis" label={k.zinsbindungBis} typ="date" wert={isoDatum(kredit?.zinsbindungBis)} hinweis={t.zinsArten.FEST} />
        <Feld name="referenzzins" label={k.referenzzins} wert={kredit?.referenzzins} platzhalter="3M-EURIBOR" hinweis={t.zinsArten.VARIABEL} />
        <Feld name="marge" label={k.marge} wert={f.eingabe(kredit?.marge)} inputMode="decimal" hinweis={t.zinsArten.VARIABEL} />
      </Felder>

      <Felder>
        <Auswahl name="zahlweise" label={k.zahlweise} wert={kredit?.zahlweise ?? "MONATLICH"} optionen={optionen(t.zahlweisen)} pflicht />
        <Auswahl name="tilgungsart" label={k.tilgungsart} wert={kredit?.tilgungsart ?? "ANNUITAET"} optionen={optionen(t.tilgungsarten)} pflicht />
        <Feld name="anfaenglicheTilgung" label={k.anfaenglicheTilgung} wert={f.eingabe(kredit?.anfaenglicheTilgung)} inputMode="decimal" />
        <Feld name="ratenbetrag" label={k.ratenbetrag} wert={f.eingabe(kredit?.ratenbetrag, 2)} inputMode="decimal" hinweis={k.ratenbetragHinweis} />
        <Textfeld name="notiz" label={t.allgemein.notiz} wert={kredit?.notiz} />
      </Felder>

      {haeuser.length > 0 && (
        <fieldset>
          <legend className="text-sm font-semibold">{k.haeuser}</legend>
          <p className="mb-2 text-xs text-slate-500">{k.anteilHinweis}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {haeuser.map((h) => (
              <Feld key={h.id} name={`anteil:${h.id}`} label={`${h.bezeichnung} (${k.anteil})`} wert={f.eingabe(anteil(h.id))} inputMode="decimal" />
            ))}
          </div>
        </fieldset>
      )}
    </Formular>
  );
}
