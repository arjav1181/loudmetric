/**
 * Presentation primitives, ported from the portfolio's admin panel.
 *
 * Re-exported from PortedUI rather than reimplemented. The point of porting the
 * UI was to have the same code, not the same idea written twice — a hand-rolled
 * version of a design system is a second design system, and the two drift apart
 * within a week.
 */

export { LABEL, CARD, Panel, Stat, Delta, Table } from "./PortedUI";
import { Bars as PortedBars } from "./PortedUI";

/**
 * LoudMetric-specific primitives.
 *
 * The ported components above cover everything the portfolio admin already had.
 * These three exist because this product measures something the portfolio does
 * not: it reports the limits of its own numbers, and a tool that omits a number
 * because the limit is inconvenient is the kind of tool people stop trusting.
 */

/** A note about what a number can and cannot mean. */
export function Caveat({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-l-2 border-white/10 pl-2.5 text-[11px] leading-relaxed text-white/30">
      {children}
    </p>
  );
}

/** Horizontal meter. `fraction` is 0..1; the track is deliberately faint. */
export function Meter({ fraction, tone = "bg-white/40" }: { fraction: number; tone?: string }) {
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

export function Pill({ href, active, children }: { href: string; active?: boolean; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className={`rounded-md px-2.5 py-1 font-mono text-[11px] tabular-nums transition-colors ${
        active ? "bg-white/[0.09] text-white" : "text-white/40 hover:bg-white/[0.04] hover:text-white/70"
      }`}
    >
      {children}
    </a>
  );
}

/**
 * The ported Empty takes a plain label string; several of our empty states need
 * rich copy with inline code, so this wraps it and keeps the same markup.
 */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-4 py-8 text-center">
      <p className="text-[13px] text-white/35">{children}</p>
      <p className="max-w-xs text-[11px] text-white/20">
        Metrics appear once real traffic arrives. Nothing is ever backfilled or estimated.
      </p>
    </div>
  );
}

/**
 * The ported Bars renders rows and has no empty state of its own; ours takes an
 * `empty` message so each panel can say something specific rather than a shared
 * generic. Same bar rendering underneath.
 */
export function Bars({
  rows,
  empty = "Nothing recorded yet.",
}: {
  rows: { name: string; value: number; hint?: string }[];
  empty?: string;
}) {
  if (!rows.length) {
    return <p className="py-6 text-center text-[12px] text-white/25">{empty}</p>;
  }
  return <PortedBars rows={rows} />;
}
