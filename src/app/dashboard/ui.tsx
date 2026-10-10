/**
 * Geist primitives for LoudMetric.
 *
 * Built against the official Geist dark token table: surfaces on
 * background-100, structure on translucent gray-alpha borders, 6px radii,
 * a 4px spacing scale, and colour reserved for state rather than decoration.
 *
 * These replace the components previously copied from the portfolio's admin.
 * Those were a faithful copy of a different product's UI; Geist is a published
 * system with its own defaults, and reproducing a screenshot of it by hand
 * produces an approximation that drifts.
 */

export const CARD = "geist-panel";

export function Panel({
  title,
  hint,
  action,
  children,
  className = "",
  dense = false,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  dense?: boolean;
}) {
  return (
    <section className={`geist-panel ${className}`}>
      <header className="flex items-start justify-between gap-3 border-b border-white/[0.09] px-4 py-3">
        <div className="min-w-0">
          <h2 className="geist-label">{title}</h2>
          {hint ? <p className="mt-1 text-[12px] leading-snug text-white/45">{hint}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className={dense ? "p-3" : "p-4"}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
  delta,
  goodDirection = "up",
}: {
  label: string;
  value: string | number;
  sub?: string;
  delta?: number | null;
  /** Bounce rate rising is bad; dwell time rising is good. */
  goodDirection?: "up" | "down";
}) {
  return (
    <div className="geist-panel p-4">
      <p className="geist-label">{label}</p>
      <p className="geist-mono mt-2 text-[26px] font-medium leading-none tracking-[-0.02em] tabular-nums">
        {value}
      </p>
      <div className="mt-2 flex items-baseline gap-2">
        {delta !== undefined ? <Delta value={delta} goodDirection={goodDirection} /> : null}
        {sub ? <span className="truncate text-[12px] text-white/40">{sub}</span> : null}
      </div>
    </div>
  );
}

/**
 * Change indicator.
 *
 * Below 0.05% it renders neutral rather than a coloured arrow: a rounding
 * artefact must not read as a result. Colour is never the only cue — the arrow
 * glyph and the sign carry the same information.
 */
export function Delta({
  value,
  goodDirection = "up",
}: {
  value: number | null;
  goodDirection?: "up" | "down";
}) {
  if (value === null) {
    return <span className="geist-mono text-[11px] text-white/30">no baseline</span>;
  }
  const up = value >= 0;
  const good = up ? goodDirection === "up" : goodDirection === "down";
  const flat = Math.abs(value) < 0.05;
  const tone = flat
    ? "text-white/30"
    : good
      ? "text-emerald-300"
      : "text-red-300";
  return (
    <span
      className={`geist-mono text-[11px] tabular-nums ${tone}`}
      title="Change against the previous period of the same length"
    >
      {up ? "▲" : "▼"} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

/**
 * Horizontal bars sharing one scale.
 *
 * Every row uses the same track geometry, so the fill length is the only thing
 * that varies and the bars are actually comparable. A row whose label changes
 * the plot width would be a layout failure, not a chart.
 */
export function Bars({
  rows,
  empty = "Nothing recorded yet.",
}: {
  rows: { name: string; value: number; hint?: string }[];
  empty?: string;
}) {
  if (!rows.length) {
    return <p className="py-6 text-center text-[12px] text-white/30">{empty}</p>;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.name}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="geist-mono truncate text-[12px] text-white/70">{r.name}</span>
            <span className="geist-mono shrink-0 text-[12px] tabular-nums text-white/50">
              {r.hint ?? r.value.toLocaleString()}
            </span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-[2px] bg-white/[0.06]">
            <div
              className="h-full rounded-[2px] bg-white/30"
              style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Empty states point at the first action, per Geist voice guidance — they do
 * not apologise and they do not merely report absence.
 */
export function Empty({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-4 py-8 text-center">
      <p className="text-[13px] text-white/55">{label}</p>
      {hint ? <p className="max-w-xs text-[12px] text-white/35">{hint}</p> : null}
    </div>
  );
}

/** Semantic table. Column headers match their cells' alignment. */
export function Table({
  head,
  rows,
  numeric = [],
}: {
  head: string[];
  rows: React.ReactNode[][];
  /** Indices whose header and every cell are right-aligned. */
  numeric?: number[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={h}
                scope="col"
                className={`geist-label border-b border-white/[0.09] pb-2 font-medium ${
                  numeric.includes(i) ? "text-right" : "text-left"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-white/[0.06] last:border-0">
              {r.map((c, ci) => (
                <td
                  key={ci}
                  className={`geist-mono py-2.5 align-baseline tabular-nums text-white/70 ${
                    numeric.includes(ci) ? "text-right" : "text-left"
                  }`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A note about what a number cannot mean.
 *
 * This product measures things precisely, so it has to be precise about its own
 * limits. The boundary is a left rule rather than a box — a box would imply the
 * caveat is a discrete component rather than a subordinate note.
 */
export function Caveat({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-l border-white/15 pl-3 text-[12px] leading-relaxed text-white/40">
      {children}
    </p>
  );
}

/** Horizontal meter with a shared track geometry. */
export function Meter({ fraction, tone = "bg-white/30" }: { fraction: number; tone?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-[2px] bg-white/[0.06]">
      <div
        className={`h-full rounded-[2px] ${tone}`}
        style={{ width: `${Math.max(2, Math.min(100, fraction * 100))}%` }}
      />
    </div>
  );
}

export function GradeDot({ tone }: { tone: string }) {
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${tone}`} />;
}
