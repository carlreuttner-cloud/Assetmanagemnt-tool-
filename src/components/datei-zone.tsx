"use client";

/**
 * Feld für mehrere Dateien mit Ziehen und Ablegen (Drag & Drop). Die abgelegten Dateien landen
 * im normalen Datei-Feld, sodass das umgebende Formular sie wie ausgewählte Dateien sendet.
 */
import { useRef, useState } from "react";

export function DateiZone({ name, accept, texte }: { name: string; accept: string; texte: { ziehen: string; auswaehlen: string; gewaehlt: string; hinweis: string } }) {
  const feld = useRef<HTMLInputElement>(null);
  const [anzahl, setAnzahl] = useState(0);
  const [darueber, setDarueber] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDarueber(true);
      }}
      onDragLeave={() => setDarueber(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDarueber(false);
        if (!feld.current || e.dataTransfer.files.length === 0) return;
        const liste = new DataTransfer();
        for (const f of Array.from(e.dataTransfer.files)) liste.items.add(f);
        feld.current.files = liste.files;
        setAnzahl(liste.files.length);
      }}
      className={`rounded-xl border-2 border-dashed p-6 text-center text-sm transition ${darueber ? "border-teal-600 bg-teal-50" : "border-slate-300 bg-slate-50"}`}
      data-datei-zone
    >
      <p className="font-medium text-slate-700">{texte.ziehen}</p>
      <label className="mt-2 inline-block cursor-pointer rounded-md bg-white px-3 py-1.5 font-medium text-slate-800 ring-1 ring-slate-300 hover:bg-slate-100">
        {texte.auswaehlen}
        <input ref={feld} type="file" name={name} multiple accept={accept} className="sr-only" onChange={(e) => setAnzahl(e.target.files?.length ?? 0)} />
      </label>
      {anzahl > 0 && <p className="mt-2 text-teal-800">{texte.gewaehlt.replace("{anzahl}", String(anzahl))}</p>}
      <p className="mt-2 text-xs text-slate-500">{texte.hinweis}</p>
    </div>
  );
}
