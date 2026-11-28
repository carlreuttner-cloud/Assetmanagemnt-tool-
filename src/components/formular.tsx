"use client";

import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";
import type { AktionsErgebnis } from "@/lib/formular";
import { knopfKlasse, type KnopfArt } from "./ui";

type Aktion = (vorher: AktionsErgebnis, fd: FormData) => Promise<AktionsErgebnis>;

/**
 * Formular mit Server-Aktion. Zeigt Fehler- und Erfolgsmeldungen der Aktion an.
 * Die Aktion bekommt das vorherige Ergebnis und die Formulardaten.
 */
export function Formular({
  aktion,
  absenden,
  children,
  art = "primaer",
  bestaetigen,
  zuruecksetzen = false,
  className = "space-y-4",
  inline = false,
  laeuftText,
}: {
  aktion: Aktion;
  absenden: string;
  children?: ReactNode;
  art?: KnopfArt;
  /** Rückfrage vor dem Absenden (z. B. beim Löschen) */
  bestaetigen?: string;
  /** Felder nach erfolgreichem Absenden leeren */
  zuruecksetzen?: boolean;
  className?: string;
  inline?: boolean;
  /** Hinweis, solange die Aktion läuft (bei langen Aktionen) */
  laeuftText?: string;
}) {
  const [ergebnis, ausfuehren, laeuft] = useActionState<AktionsErgebnis, FormData>(aktion, {});
  const formular = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (zuruecksetzen && ergebnis.ok) formular.current?.reset();
  }, [ergebnis, zuruecksetzen]);

  return (
    <form
      ref={formular}
      className={inline ? "inline" : className}
      onSubmit={(e) => {
        // Selbst absenden, damit React die Eingaben bei einem Fehler nicht leert.
        e.preventDefault();
        if (bestaetigen && !window.confirm(bestaetigen)) return;
        // Mit dem auslösenden Knopf, damit name/value eines zweiten Knopfs mitgeschickt werden
        const daten = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => ausfuehren(daten));
      }}
    >
      {children}
      <div className={inline ? "inline" : "flex flex-wrap items-center gap-3"}>
        <button
          type="submit"
          disabled={laeuft}
          className={inline ? "text-xs font-medium text-red-700 hover:underline disabled:opacity-50" : knopfKlasse(art)}
        >
          {absenden}
        </button>
        {laeuft && laeuftText && <span role="status" className="text-sm text-slate-600">{laeuftText}</span>}
        {ergebnis.fehler && <span role="alert" className="text-sm text-red-700">{ergebnis.fehler}</span>}
        {ergebnis.ok && !inline && <span className="text-sm text-emerald-700">{ergebnis.ok}</span>}
      </div>
    </form>
  );
}
