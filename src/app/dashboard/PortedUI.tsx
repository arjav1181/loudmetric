import Link from "next/link";

export const LABEL = "text-[10px] tracking-[0.2em] text-white/40 uppercase";
export const CARD = "border border-white/10 bg-white/[0.02]";

/**
 * Presentation primitives shared by every admin section.
 *
 * Built around the portfolio's own visual language — black, hairline borders,
 * one accent, JetBrains Mono for anything numeric — but tightened for density
 * and scanability, which is what a panel needs and a marketing page does not.
 */

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
    <section className={`${CARD} ${className}`}>
      <header className="flex items-start justify-between gap-3 border-b border-white/[0.07] px-4 py-3">
        <div className="min-w-0">
          <h2 className={LABEL}>{title}</h2>
          {hint ? <p className="mt-1 text-[11px] leading-snug text-white/30">{hint}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className={dense ? "p-3" : "p-4"}>{children}</div>
    </section>
  );
}

/** A number, in the typeface that makes digits line up. */
export function Stat({
  label,
  value,
  sub,
  delta,
  goodDirection = "up",
}: {
  label: string;
  /** Accepts a number so count panels can pass a value without formatting it here. */
  value: string | number;
  sub?: string;
  /**
   * Which direction is an improvement. Bounce rate rising is bad; dwell time
   * rising is good. The portfolio has no such metric, so this is the one
   * addition LoudMetric needed, and it is a prop rather than a forked component.
   */
  goodDirection?: "up" | "down";
  delta?: number | null;
}) {
  return (
    <div className={`${CARD} p-3.5`}>
      <p className={LABEL}>{label}</p>
      <p className="mt-1.5 font-mono text-2xl leading-none tracking-tight text-white tabular-nums">
        {value}
      </p>
      <div className="mt-1.5 flex items-baseline gap-2">
        {delta !== undefined ? <Delta value={delta} goodDirection={goodDirection} /> : null}
        {sub ? <span className="text-[11px] text-white/30">{sub}</span> : null}
      </div>
    </div>
  );
}

export function Delta({
    value,
    goodDirection = "up",
  }: {
    value: number | null;
    goodDirection?: "up" | "down";
  }) {
  if (value === null) {
    return <span className="font-mono text-[11px] text-white/25">—</span>;
  }
  const up = value >= 0;
  return (
    <span
      className={`font-mono text-[11px] tabular-nums ${up ? "text-emerald-300/80" : "text-red-300/80"}`}
      title="Change against the previous period of the same length"
    >
      {up ? "▲" : "▼"} {Math.abs(value)}%
    </span>
  );
}

/**
 * Horizontal bar rows. `value` is absolute; `max` normalises the scale so rows
 * are comparable within the panel.
 */
export function Bars({
  rows,
  max,
  showShare = true,
  total,
}: {
  rows: { name: string; value: number }[];
  max?: number;
  showShare?: boolean;
  total?: number;
}) {
  if (rows.length === 0) return <Empty label="Nothing recorded yet." />;
  const peak = max ?? Math.max(...rows.map((r) => r.value), 1);
  const sum = total ?? rows.reduce((s, r) => s + r.value, 0);
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li key={r.name} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2">
          <span className="truncate text-[12px] text-white/55" title={r.name}>
            {r.name}
          </span>
          <span className="h-1.5 bg-white/[0.06]">
            <span
              className="block h-full bg-white/45"
              style={{ width: `${Math.max(1.5, (r.value / peak) * 100)}%` }}
            />
          </span>
          <span className="font-mono text-[11px] text-white/45 tabular-nums">
            {r.value}
            {showShare && sum > 0 ? (
              <span className="ml-1.5 text-white/25">{Math.round((r.value / sum) * 100)}%</span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A real empty state, not a blank box. */
export function Empty({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-4 py-8 text-center">
      <p className="text-[13px] text-white/35">{label}</p>
      {hint ? <p className="max-w-xs text-[11px] text-white/20">{hint}</p> : null}
    </div>
  );
}

/**
 * Marks a panel whose numbers ignore the selected date range, because they are
 * only ever stored as all-time counters. Being explicit beats showing a number
 * under a filter that does not apply to it.
 */
export function AllTimeTag({ note }: { note?: string }) {
  return (
    <span
      title={note || "Stored as an all-time counter, so the date range does not apply."}
      className="shrink-0 border border-white/15 px-1.5 py-0.5 text-[9px] tracking-[0.15em] text-white/35 uppercase"
    >
      All time
    </span>
  );
}

/** Sparkline. Pure SVG, no chart dependency. */
export function Spark({
  values,
  height = 34,
  accent = "bg-white/45",
}: {
  values: number[];
  height?: number;
  accent?: string;
}) {
  if (values.length < 2) return <div style={{ height }} />;
  const max = Math.max(...values, 1);
  const step = 100 / (values.length - 1);
  const points = values.map((v, i) => `${(i * step).toFixed(2)},${(100 - (v / max) * 100).toFixed(2)}`);
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ height }}
      className="w-full"
      aria-hidden="true"
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        className="text-white/45"
      />
    </svg>
  );
}

export function Table({
  head,
  rows,
}: {
  head: string[];
  rows: (string | number | React.ReactNode)[][];
}) {
  if (rows.length === 0) return <Empty label="No rows." />;
  return (
    <div className="-mx-4 overflow-x-auto md:-mx-0">
      <table className="w-full min-w-[26rem] border-collapse text-left">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={h}
                className={`border-b border-white/10 pb-2 text-[10px] tracking-[0.15em] text-white/35 uppercase ${
                  i > 0 ? "text-right" : ""
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-white/[0.05] last:border-0">
              {r.map((c, ci) => (
                <td
                  key={ci}
                  className={`py-2 pr-4 text-[12px] ${ci > 0 ? "text-right font-mono text-white/55 tabular-nums" : "text-white/65"}`}
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

/** Small pill toggle used for ranges and switches. */
export function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`px-2.5 py-1.5 text-[11px] tracking-[0.1em] uppercase transition-colors ${
        active ? "bg-white/90 text-black" : "text-white/40 hover:bg-white/[0.06] hover:text-white/70"
      }`}
    >
      {children}
    </button>
  );
}