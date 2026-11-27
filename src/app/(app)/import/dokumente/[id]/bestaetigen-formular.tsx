"use client";

import { useState } from "react";
import { Formular } from "@/components/formular";
import type { Texte } from "@/i18n";
import { DOKUMENT_KATEGORIEN, einheitlicherName, type ObjektArt } from "@/lib/dokument-vorschlag";
import type { AktionsErgebnis } from "@/lib/formular";

const EINGABE = "mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm";

type Objekt = { art: ObjektArt; id: string; name: string };

/** Formular zum Bestätigen von Name, Kategorie, Jahr/Datum und Zuordnung; der Name folgt den Feldern, bis er von Hand geändert wird. */
export function BestaetigenFormular({
  td,
  aktion,
  objekte,
  start,
}: {
  td: Texte["dateien"];
  aktion: (vorher: AktionsErgebnis, fd: FormData) => Promise<AktionsErgebnis>;
  objekte: Objekt[];
  start: { titel: string; kategorie: string | null; jahr: number | null; datum: string | null; zuordnung: string | null };
}) {
  const [kategorie, setKategorie] = useState(start.kategorie ?? "");
  const [jahr, setJahr] = useState(start.jahr ? String(start.jahr) : "");
  const [datum, setDatum] = useState(start.datum ?? "");
  const [zuordnung, setZuordnung] = useState(start.zuordnung ?? "");
  const [manuell, setManuell] = useState<string | null>(null);

  const objektName = objekte.find((o) => `${o.art}:${o.id}` === zuordnung)?.name ?? null;
  const vorschlag = einheitlicherName(
    { kategorie: kategorie || null, jahr: /^\d{4}$/.test(jahr) ? Number(jahr) : null, datum: datum || null, objekt: objektName },
    td.ohneKategorie,
  );
  // Ein bereits bestätigter, abweichender Name gilt als von Hand vergeben.
  const [startManuell] = useState(start.titel !== vorschlag ? start.titel : null);
  const titel = manuell ?? startManuell ?? vorschlag;
  const vonHand = (manuell ?? startManuell) !== null && titel !== vorschlag;

  const gruppen: ObjektArt[] = ["gesellschaft", "haus", "kredit"];
  return (
    <Formular aktion={aktion} absenden={td.speichern}>
      <label className="block text-sm">
        <span className="font-medium text-slate-700">{td.name}</span>
        <input name="titel" value={titel} onChange={(e) => setManuell(e.target.value)} required maxLength={300} className={EINGABE} />
        <span className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
          {vonHand ? td.nameManuell : td.nameAutomatisch}
          {vonHand && (
            <button type="button" className="font-medium text-sky-700 hover:underline" onClick={() => setManuell(vorschlag)}>
              {td.nameNeu}: „{vorschlag}“
            </button>
          )}
        </span>
      </label>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">{td.kategorie}</span>
          <select name="kategorie" value={kategorie} onChange={(e) => setKategorie(e.target.value)} className={EINGABE}>
            <option value="">{td.keineKategorie}</option>
            {DOKUMENT_KATEGORIEN.map((k) => (
              <option key={k.name} value={k.name}>
                {k.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">{td.zuordnung}</span>
          <select name="zuordnung" value={zuordnung} onChange={(e) => setZuordnung(e.target.value)} className={EINGABE}>
            <option value="">{td.keineZuordnung}</option>
            {gruppen.map((g) => (
              <optgroup key={g} label={td.gruppen[g]}>
                {objekte
                  .filter((o) => o.art === g)
                  .map((o) => (
                    <option key={o.id} value={`${o.art}:${o.id}`}>
                      {o.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">{td.jahr}</span>
          <input name="jahr" value={jahr} onChange={(e) => setJahr(e.target.value)} inputMode="numeric" pattern="\d{4}" className={EINGABE} />
          <span className="mt-1 block text-xs text-slate-500">{td.jahrHinweis}</span>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">{td.datum}</span>
          <input name="dokumentDatum" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} className={EINGABE} />
        </label>
      </div>
    </Formular>
  );
}
