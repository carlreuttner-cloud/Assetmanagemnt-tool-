/**
 * Schlanke SVG-Diagramme (Server-Komponenten, keine Bibliothek). Werte kommen als Decimal und
 * werden nur für die Zeichenposition in Bildschirmkoordinaten umgerechnet.
 */
import type { Decimal } from "@/lib/geld";
import { alsDbDatum, type IsoDatum } from "@/lib/datum";

export const FARBEN = ["#0f766e", "#1d4ed8", "#b45309", "#7c3aed", "#be123c", "#4d7c0f", "#0369a1", "#a16207"];

export type Reihe = { name: string; farbe?: string; punkte: { x: IsoDatum; y: Decimal }[]; gestrichelt?: boolean };

const B = 600;
const H = 240;
const RAND = { l: 72, r: 28, o: 12, u: 28 };

function px(wert: Decimal, min: Decimal, max: Decimal) {
  const anteil = max.equals(min) ? 0.5 : wert.minus(min).dividedBy(max.minus(min)).toNumber();
  return RAND.o + (1 - anteil) * (H - RAND.o - RAND.u);
}

function rundeSkala(min: Decimal, max: Decimal) {
  // 5 % Luft oben und unten; bei konstanten Werten ±10 %.
  const spanne = max.minus(min);
  if (spanne.isZero()) return { min: min.minus(min.abs().times("0.1")), max: max.plus(max.abs().times("0.1")).plus(1) };
  return { min: min.minus(spanne.times("0.05")), max: max.plus(spanne.times("0.05")) };
}

export function Liniendiagramm({
  reihen,
  formatY,
  formatX,
  nullLinie = false,
  ab0 = false,
}: {
  reihen: Reihe[];
  formatY: (w: Decimal) => string;
  formatX: (d: IsoDatum) => string;
  nullLinie?: boolean;
  /** y-Achse bei 0 beginnen */
  ab0?: boolean;
}) {
  const alle = reihen.flatMap((r) => r.punkte);
  if (alle.length === 0) return null;
  const xs = alle.map((p) => alsDbDatum(p.x).getTime());
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  let yMin = alle.reduce((m, p) => (p.y.lessThan(m) ? p.y : m), alle[0].y);
  let yMax = alle.reduce((m, p) => (p.y.greaterThan(m) ? p.y : m), alle[0].y);
  if (ab0 && yMin.greaterThan(0)) yMin = yMin.times(0);
  ({ min: yMin, max: yMax } = rundeSkala(yMin, yMax));
  if (ab0 && yMin.lessThan(0) && alle.every((p) => p.y.greaterThanOrEqualTo(0))) yMin = yMin.times(0);

  const x = (d: IsoDatum) => {
    const t = alsDbDatum(d).getTime();
    return RAND.l + (xMax === xMin ? 0.5 : (t - xMin) / (xMax - xMin)) * (B - RAND.l - RAND.r);
  };
  const linien = [0, 1, 2, 3, 4].map((i) => yMin.plus(yMax.minus(yMin).times(i).dividedBy(4)));
  const xTicks = [...new Set([alle[0].x, ...alle.map((p) => p.x)])]
    .sort()
    .filter((_, i, l) => l.length <= 6 || i % Math.ceil(l.length / 6) === 0 || i === l.length - 1);

  return (
    <div>
      <svg viewBox={`0 0 ${B} ${H}`} className="h-auto w-full" role="img">
        {linien.map((w, i) => (
          <g key={i}>
            <line x1={RAND.l} x2={B - RAND.r} y1={px(w, yMin, yMax)} y2={px(w, yMin, yMax)} stroke="#e2e8f0" />
            <text x={RAND.l - 6} y={px(w, yMin, yMax) + 4} textAnchor="end" fontSize="11" fill="#64748b">
              {formatY(w)}
            </text>
          </g>
        ))}
        {nullLinie && yMin.lessThan(0) && yMax.greaterThan(0) && (
          <line x1={RAND.l} x2={B - RAND.r} y1={px(yMin.times(0), yMin, yMax)} y2={px(yMin.times(0), yMin, yMax)} stroke="#94a3b8" />
        )}
        {xTicks.map((d) => (
          <text key={d} x={x(d)} y={H - 8} textAnchor="middle" fontSize="11" fill="#64748b">
            {formatX(d)}
          </text>
        ))}
        {reihen.map((r, i) => {
          const farbe = r.farbe ?? FARBEN[i % FARBEN.length];
          const punkte = [...r.punkte].sort((a, b) => (a.x < b.x ? -1 : 1));
          return (
            <g key={r.name}>
              <polyline
                fill="none"
                stroke={farbe}
                strokeWidth="2"
                strokeDasharray={r.gestrichelt ? "5 4" : undefined}
                points={punkte.map((p) => `${x(p.x)},${px(p.y, yMin, yMax)}`).join(" ")}
              />
              {punkte.length <= 40 &&
                punkte.map((p) => (
                  <circle key={p.x} cx={x(p.x)} cy={px(p.y, yMin, yMax)} r="3" fill={farbe}>
                    <title>{`${r.name} · ${formatX(p.x)}: ${formatY(p.y)}`}</title>
                  </circle>
                ))}
            </g>
          );
        })}
      </svg>
      {reihen.length > 1 && <Legende eintraege={reihen.map((r, i) => ({ name: r.name, farbe: r.farbe ?? FARBEN[i % FARBEN.length] }))} />}
    </div>
  );
}

export function Legende({ eintraege }: { eintraege: { name: string; farbe: string }[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {eintraege.map((e) => (
        <span key={e.name} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: e.farbe }} />
          {e.name}
        </span>
      ))}
    </div>
  );
}

/** Waagerechte Balken, z. B. für Anteile je Gesellschaft. */
export function Balkendiagramm({
  balken,
  format,
}: {
  balken: { name: string; wert: Decimal; farbe?: string; zusatz?: string }[];
  format: (w: Decimal) => string;
}) {
  const max = balken.reduce((m, b) => (b.wert.greaterThan(m) ? b.wert : m), balken[0]?.wert.times(0) ?? null);
  if (!max) return null;
  return (
    <div className="space-y-2">
      {balken.map((b, i) => {
        const breite = max.isZero() ? 0 : Math.max(0, b.wert.dividedBy(max).times(100).toNumber());
        return (
          <div key={b.name} className="text-sm">
            <div className="flex justify-between gap-2">
              <span className="truncate text-slate-700">{b.name}</span>
              <span className="shrink-0 tabular-nums text-slate-900">
                {format(b.wert)}
                {b.zusatz && <span className="ml-1 text-xs text-slate-500">{b.zusatz}</span>}
              </span>
            </div>
            <div className="mt-1 h-2 rounded bg-slate-100">
              <div className="h-2 rounded" style={{ width: `${breite}%`, background: b.farbe ?? FARBEN[i % FARBEN.length] }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
