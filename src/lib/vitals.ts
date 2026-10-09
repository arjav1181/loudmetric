/**
 * Core Web Vitals thresholds.
 *
 * Google's published thresholds, current as of the CrUX v3 update. "Good" is not
 * "fast enough to be nice" — it is the point below which CrUX counts a load as
 * good in the field.
 */

export type Metric = "lcp" | "cls" | "inp";

export type Grade = "good" | "needs-improvement" | "poor" | "unknown";

export const METRICS: Record<
  Metric,
  { label: string; full: string; unit: string; good: number; poor: number; decimals: number }
> = {
  lcp: {
    label: "LCP",
    full: "Largest Contentful Paint",
    unit: "ms",
    good: 2500,
    poor: 4000,
    decimals: 0,
  },
  cls: {
    label: "CLS",
    full: "Cumulative Layout Shift",
    unit: "",
    good: 0.1,
    poor: 0.25,
    decimals: 3,
  },
  inp: {
    label: "INP",
    full: "Interaction to Next Paint",
    unit: "ms",
    good: 200,
    poor: 500,
    decimals: 0,
  },
};

/** cls is unitless and small; everything else is milliseconds. */
export function formatVital(metric: Metric, value: number | null): string {
  if (value === null) return "—";
  const m = METRICS[metric];
  return `${value.toFixed(m.decimals)}${m.unit}`;
}

export function gradeVital(metric: Metric, value: number | null): Grade {
  if (value === null) return "unknown";
  const m = METRICS[metric];
  if (value <= m.good) return "good";
  if (value <= m.poor) return "needs-improvement";
  return "poor";
}

export const GRADE_TEXT: Record<Grade, string> = {
  good: "text-emerald-300",
  "needs-improvement": "text-amber-300",
  poor: "text-red-300",
  unknown: "text-white/25",
};

export const GRADE_DOT: Record<Grade, string> = {
  good: "bg-emerald-400",
  "needs-improvement": "bg-amber-400",
  poor: "bg-red-400",
  unknown: "bg-white/20",
};

/**
 * Gauges share one scale per metric so the visual length means the same thing
 * in every panel. Without this, a CLS bar and an LCP bar drawn to their own
 * maxima would look identical and mean wildly different things.
 */
export function vitalFraction(metric: Metric, value: number | null): number {
  if (value === null) return 0;
  const m = METRICS[metric];
  return Math.max(0, Math.min(1, value / m.poor));
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}
