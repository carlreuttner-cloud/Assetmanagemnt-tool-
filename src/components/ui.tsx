/**
 * Kleine Bausteine für eine einheitliche Oberfläche (Server-Komponenten, ohne Zustand).
 */
import Link from "next/link";
import type { ReactNode } from "react";

export function Seitenkopf({
  titel,
  beschreibung,
  zurueck,
  aktionen,
}: {
  titel: ReactNode;
  beschreibung?: ReactNode;
  zurueck?: { href: string; text: string };
  aktionen?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {zurueck && (
        <Link href={zurueck.href} className="mb-2 inline-block text-sm text-slate-500 hover:text-slate-800">
          ← {zurueck.text}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{titel}</h1>
          {beschreibung && <p className="mt-1 text-slate-600">{beschreibung}</p>}
        </div>
        {aktionen && <div className="flex flex-wrap gap-2">{aktionen}</div>}
      </div>
    </div>
  );
}

export function Karte({ titel, aktionen, children, className = "" }: { titel?: ReactNode; aktionen?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-5 ${className}`}>
      {(titel || aktionen) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {titel && <h2 className="text-base font-semibold">{titel}</h2>}
          {aktionen && <div className="flex flex-wrap gap-2">{aktionen}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kachel({ titel, wert, unter, ton }: { titel: ReactNode; wert: ReactNode; unter?: ReactNode; ton?: Ton }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{titel}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${ton ? TON_TEXT[ton] : ""}`}>{wert}</div>
      {unter && <div className="mt-1 text-xs text-slate-500">{unter}</div>}
    </div>
  );
}

export function Kacheln({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

/** Zwei Werte untereinander: Monatsmiete und daraus berechnete Jahresmiete. */
export function MieteZelle({ monat, jahr }: { monat: ReactNode; jahr: ReactNode }) {
  return (
    <div className="tabular-nums">
      <div>{monat}</div>
      <div className="text-xs text-slate-500">{jahr}</div>
    </div>
  );
}

export type Ton = "gut" | "warnung" | "schlecht" | "neutral";
const TON_TEXT: Record<Ton, string> = {
  gut: "text-emerald-700",
  warnung: "text-amber-700",
  schlecht: "text-red-700",
  neutral: "text-slate-700",
};
const TON_MARKE: Record<Ton, string> = {
  gut: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warnung: "bg-amber-50 text-amber-800 ring-amber-200",
  schlecht: "bg-red-50 text-red-800 ring-red-200",
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
};

export function Marke({ ton = "neutral", children }: { ton?: Ton; children: ReactNode }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TON_MARKE[ton]}`}>{children}</span>;
}

export function Tabelle({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm [&_td]:border-t [&_td]:border-slate-100 [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-slate-500 [&_tfoot_td]:border-t-2 [&_tfoot_td]:border-slate-200 [&_tfoot_td]:font-semibold">
        {children}
      </table>
    </div>
  );
}

export const rechts = "text-right tabular-nums";

const KNOPF = {
  primaer: "bg-slate-900 text-white hover:bg-slate-700",
  sekundaer: "bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50",
  gefahr: "bg-white text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50",
};
export type KnopfArt = keyof typeof KNOPF;
export const knopfKlasse = (art: KnopfArt = "primaer") =>
  `inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${KNOPF[art]}`;

export function KnopfLink({ href, art = "sekundaer", children }: { href: string; art?: KnopfArt; children: ReactNode }) {
  return (
    <Link href={href} className={knopfKlasse(art)}>
      {children}
    </Link>
  );
}

export function Leer({ children }: { children: ReactNode }) {
  return <p className="py-4 text-sm text-slate-500">{children}</p>;
}

/** Beschriftete Werte in zwei Spalten (Stammdaten). */
export function Angaben({ eintraege }: { eintraege: Array<[ReactNode, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {eintraege.map(([name, wert], i) => (
        <div key={i}>
          <dt className="text-slate-500">{name}</dt>
          <dd className="mt-0.5 font-medium">{wert ?? "–"}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Formularfelder (ohne Zustand; das Formular selbst ist `Formular` in formular.tsx)
// ---------------------------------------------------------------------------

const EINGABE = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm shadow-sm focus:border-slate-500 focus:outline-none";

export function Feld({
  name,
  label,
  hinweis,
  typ = "text",
  wert,
  pflicht,
  platzhalter,
  breit,
  ...rest
}: {
  name: string;
  label: ReactNode;
  hinweis?: ReactNode;
  typ?: "text" | "date" | "email" | "number" | "file";
  wert?: string | null;
  pflicht?: boolean;
  platzhalter?: string;
  breit?: boolean;
  inputMode?: "decimal" | "numeric" | "text";
  accept?: string;
}) {
  return (
    <label className={`block text-sm ${breit ? "sm:col-span-2" : ""}`}>
      <span className="font-medium text-slate-700">{label}</span>
      <input
        name={name}
        type={typ}
        defaultValue={wert ?? undefined}
        required={pflicht}
        placeholder={platzhalter}
        className={EINGABE}
        {...rest}
      />
      {hinweis && <span className="mt-1 block text-xs text-slate-500">{hinweis}</span>}
    </label>
  );
}

export function Auswahl({
  name,
  label,
  optionen,
  wert,
  pflicht,
  leerText,
  hinweis,
}: {
  name: string;
  label: ReactNode;
  optionen: Array<{ wert: string; text: string }>;
  wert?: string | null;
  pflicht?: boolean;
  leerText?: string;
  hinweis?: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <select name={name} defaultValue={wert ?? ""} required={pflicht} className={EINGABE}>
        {leerText !== undefined && <option value="">{leerText}</option>}
        {optionen.map((o) => (
          <option key={o.wert} value={o.wert}>
            {o.text}
          </option>
        ))}
      </select>
      {hinweis && <span className="mt-1 block text-xs text-slate-500">{hinweis}</span>}
    </label>
  );
}

export function Textfeld({ name, label, wert }: { name: string; label: ReactNode; wert?: string | null }) {
  return (
    <label className="block text-sm sm:col-span-2">
      <span className="font-medium text-slate-700">{label}</span>
      <textarea name={name} defaultValue={wert ?? undefined} rows={3} className={EINGABE} />
    </label>
  );
}

export function Felder({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

export function Ankreuzfeld({ name, label, wert }: { name: string; label: ReactNode; wert?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={wert} className="h-4 w-4 rounded border-slate-300" />
      <span className="font-medium text-slate-700">{label}</span>
    </label>
  );
}

/** Umschalter als Links (z. B. Filter), der aktive ist hervorgehoben. */
export function Reiter({ eintraege }: { eintraege: Array<{ href: string; text: ReactNode; aktiv: boolean }> }) {
  return (
    <div className="mb-4 flex flex-wrap gap-2 text-sm">
      {eintraege.map((e) => (
        <Link
          key={e.href}
          href={e.href}
          className={`rounded-full px-3 py-1 ring-1 ring-inset ${e.aktiv ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"}`}
        >
          {e.text}
        </Link>
      ))}
    </div>
  );
}
