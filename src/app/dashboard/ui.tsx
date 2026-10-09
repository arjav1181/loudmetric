import Link from "next/link";

/**
 * Presentation primitives, ported from the portfolio's admin panel.
 *
 * Same visual language — black, hairline borders, one accent, JetBrains Mono for
 * anything numeric — tightened for density. A dashboard is read by scanning,
 * not by reading, so numbers align in a monospace face and labels sit at a fixed
 * small size. If a number changes width it must not shift the column beside it.
 */

export const LABEL =
  "text-[10px] font-medium tracking-[0.18em] uppercase text-white/40";

export const CARD = "rounded-lg border border-white/[0.08] bg-white/[0.02]";

export function Panel({
  title,
  hint,
  action,
  children,
  className = "",
  bodyClass = "p-4",
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <section className={`${CARD} ${className}`}>
      <header className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
        <div className="min-w-0">
          <h2 className={LABEL}>{title}</h2>
          {hint ? <p className="mt-1 text-[11px] leading-snug text-white/30">{hint}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className={bodyClass}>{children}</div>
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
  /** Percentage change vs the previous window. null means "no baseline". */
  delta?: number | null;
  /** Bounce rate going up is bad; dwell time going up is good. */
  goodDirection?: "up" | "down";
}) {
  return (
    <div className={`${CARD} p-4`}>
      <p className={LABEL}>{label}</p>
      <p className="mt-2 font-mono text-[26px] leading-none tracking-tight text-white tabular-nums">
        {value}
      </p>
      <div className="mt-2 flex items-baseline gap-2">
        {delta !== undefined ? <Delta value={delta} goodDirection={goodDirection} /> : null}
        {sub ? <span className="truncate text-[11px] text-white/30">{sub}</span> : null}
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
    return <span className="font-mono text-[11px] text-white/25">no baseline</span>;
  }
  const rising = value >= 0;
  const good = rising ? goodDirection === "up" : goodDirection === "down";
  const tone = Math.abs(value) < 0.05 ? "text-white/25" : good ? "text-emerald-300/90" : "text-red-300/90";
  return (
    <span
      className={`font-mono text-[11px] tabular-nums ${tone}`}
      title="Change against the previous period of the same length"
    >
      {rising ? "▲" : "▼"} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

/**
 * Horizontal bar rows. `max` normalises the scale so rows inside one panel are
 * comparable with each other — which is the only comparison these charts claim
 * to support.
 */
export function Bars({
  rows,
  empty = "Nothing recorded yet.",
}: {
  rows: { label: string; value: number; hint?: string; href?: string }[];
  empty?: string;
}) {
  if (!rows.length) return <p className="py-6 text-center text-[12px] text-white/25">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const inner = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate font-mono text-[12px] text-white/70">{r.label}</span>
              <span className="shrink-0 font-mono text-[12px] tabular-nums text-white/50">
                {r.hint ?? r.value.toLocaleString()}
              </span>
            </div>
            <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-white/35"
                style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%` }}
              />
            </div>
          </>
        );
        return (
          <li key={r.label}>
            {r.href ? (
              <Link href={r.href} className="block transition-opacity hover:opacity-70">
                {inner}
              </Link>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <p className="text-[13px] text-white/40">{children}</p>
      <p className="text-[11px] text-white/20">
        Metrics appear once real traffic arrives. Nothing is ever backfilled or estimated.
      </p>
    </div>
  );
}

/** A note about what a number can and cannot mean. Used liberally on purpose. */
export function Caveat({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-l-2 border-white/10 pl-2.5 text-[11px] leading-relaxed text-white/30">
      {children}
    </p>
  );
}

export function Pill({
  active,
  href,
  children,
}: {
  active?: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-md px-2.5 py-1 font-mono text-[11px] tabular-nums transition-colors ${
        active ? "bg-white/[0.09] text-white" : "text-white/40 hover:bg-white/[0.04] hover:text-white/70"
      }`}
    >
      {children}
    </Link>
  );
}

export function Meter({
  fraction,
  tone = "bg-white/40",
}: {
  fraction: number;
  tone?: string;
}) {
  return (
    <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div
        className={`h-full rounded-full ${tone}`}
        style={{ width: `${Math.max(1.5, Math.min(100, fraction * 100))}%` }}
      />
    </div>
  );
}

export function GradeDot({ tone }: { tone: string }) {
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${tone}`} />;
}

export function Table({
  head,
  rows,
  align = [],
}: {
  head: string[];
  rows: React.ReactNode[][];
  align?: ("left" | "right")[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-[12px]">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={h}
                className={`${LABEL} border-b border-white/[0.06] pb-2 font-medium ${
                  align[i] === "right" ? "text-right" : "text-left"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-white/[0.04] last:border-0">
              {r.map((c, ci) => (
                <td
                  key={ci}
                  className={`py-2.5 font-mono tabular-nums ${
                    align[ci] === "right" ? "text-right text-white/60" : "text-left text-white/75"
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
