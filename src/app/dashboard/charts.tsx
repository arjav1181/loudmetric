"use client";

import { useMemo, useState } from "react";

/**
 * Hand-built SVG charts. No charting library, deliberately.
 *
 * Recharts would add 150–400kB to render bars and a tooltip that is ~80 lines
 * here, and the funnel those libraries ship with is a stack of tapered bars
 * regardless. The one place a library is genuinely warranted — map projection —
 * is where d3-geo would go, and even that is only needed once a site has
 * visitors from more than one country.
 *
 * Every chart is keyboard-reachable and prints its own numbers in the tooltip,
 * so no value is hover-only. A screen reader gets the same information a mouse
 * gets.
 */

export type Point = { label: string; value: number; secondary?: number };

function nice(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

/** Axis ticks at round numbers, because 0/37/74 reads as noise. */
function ticksFor(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(v);
  return out;
}

/**
 * Grouped bars with a crosshair. `secondary` renders behind the primary in a
 * lighter tone, which is how pageviews/visitors are compared.
 */
export function BarChart({
  points,
  primary = "Pageviews",
  secondary,
  height = 190,
}: {
  points: Point[];
  primary?: string;
  secondary?: string;
  height?: number;
}) {
  const [i, setI] = useState<number | null>(null);
  const max = Math.max(...points.map((p) => Math.max(p.value, p.secondary ?? 0)), 1);
  const active = i === null ? null : points[i];
  const grid = ticksFor(max);
  const top = grid[grid.length - 1] || 1;

  return (
    <div className="relative">
      <div
        className="relative flex items-end gap-[2px]"
        style={{ height }}
        onMouseLeave={() => setI(null)}
      >
        {/* Horizontal gridlines behind the bars, with their own labels. */}
        {grid.map((g) => (
          <div
            key={g}
            className="pointer-events-none absolute inset-x-0 border-t border-white/[0.05]"
            style={{ bottom: `${(g / top) * 100}%` }}
          />
        ))}
        {points.map((p, idx) => {
          const h = (p.value / top) * 100;
          const h2 = p.secondary !== undefined ? (p.secondary / top) * 100 : 0;
          return (
            <button
              key={`${p.label}-${idx}`}
              type="button"
              tabIndex={-1}
              aria-label={`${p.label}: ${p.value}${
                p.secondary !== undefined ? `, ${secondary ?? ""} ${p.secondary}` : ""
              }`}
              onMouseEnter={() => setI(idx)}
              onFocus={() => setI(idx)}
              className="relative flex-1 cursor-default"
              style={{ height: "100%" }}
            >
              {p.secondary !== undefined ? (
                <span
                  className="absolute bottom-0 w-full rounded-t-[1px] bg-white/12"
                  style={{ height: `${Math.max(1, h2)}%` }}
                />
              ) : null}
              <span
                className={`absolute bottom-0 w-full rounded-t-[1px] transition-colors ${
                  i === null ? "bg-white/30" : i === idx ? "bg-white/70" : "bg-white/20"
                }`}
                style={{ height: `${Math.max(1, h)}%` }}
              />
            </button>
          );
        })}
      </div>

      {/* Axis: first, middle and last only — every label on a 90-day chart is
          unreadable overlap, and the tooltip carries the rest. */}
      <div className="mt-2 flex justify-between font-mono text-[10px] text-white/25">
        {points.length ? (
          <>
            <span>{points[0].label}</span>
            {points.length > 2 ? <span>{points[Math.floor(points.length / 2)].label}</span> : null}
            <span>{points[points.length - 1].label}</span>
          </>
        ) : null}
      </div>

      {active ? (
        <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 rounded-md border border-white/10 bg-black/95 px-2.5 py-1.5 whitespace-nowrap">
          <p className="font-mono text-[11px] text-white/50">{active.label}</p>
          <p className="font-mono text-[12px] text-white">
            {active.value.toLocaleString()} {primary.toLowerCase()}
          </p>
          {active.secondary !== undefined ? (
            <p className="font-mono text-[12px] text-white/60">
              {active.secondary.toLocaleString()} {secondary?.toLowerCase()}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-4 border-t border-white/[0.05] pt-2.5">
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-white/35">
          <span className="h-2 w-2 rounded-sm bg-white/40" /> {primary}
        </span>
        {secondary ? (
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-white/35">
            <span className="h-2 w-2 rounded-sm bg-white/12" /> {secondary}
          </span>
        ) : null}
        <span className="ml-auto font-mono text-[10px] text-white/25">peak {nice(top)}</span>
      </div>
    </div>
  );
}

/**
 * Sparkline for a single scalar series. Used in stat tiles where a full chart
 * would be noise — it shows shape, and the number beside it shows the value.
 */
export function Spark({ values, height = 34 }: { values: number[]; height?: number }) {
  if (values.length < 2) return <div style={{ height }} />;
  const max = Math.max(...values, 1);
  const w = 100;
  const step = w / (values.length - 1);
  const d = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${(height - (v / max) * height).toFixed(2)}`)
    .join(" ");
  const area = `${d} L${w},${height} L0,${height} Z`;
  const id = `spark-${values.length}-${max}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      style={{ height, width: "100%" }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.16)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * Tapered funnel. Width encodes the value, so a 90% drop and a 10% drop look
 * different at a glance — which is the entire reason to draw a funnel instead
 * of five identical-width bars.
 */
export function Funnel({
  steps,
  height = 220,
}: {
  steps: { name: string; entered: number; rate: number }[];
  height?: number;
}) {
  const top = Math.max(...steps.map((s) => s.entered), 1);
  const gap = 8;
  const barH = Math.max(22, Math.min(56, (height - gap * (steps.length - 1)) / Math.max(steps.length, 1)));
  const W = 100;

  return (
    <div className="space-y-2" style={{ minHeight: height }}>
      {steps.map((s, i) => {
        const frac = s.entered / top;
        const w = Math.max(14, frac * W);
        const prev = i > 0 ? steps[i - 1].entered : null;
        const drop = prev !== null && prev > 0 ? Math.round((1 - s.entered / prev) * 1000) / 10 : null;
        return (
          <div key={s.name} style={{ height: barH }}>
            <div className="group flex h-full items-center gap-3">
              <div className="relative h-full flex-1">
                <div
                  className="absolute inset-y-0 rounded-[3px] bg-gradient-to-r from-white/22 to-white/10 transition-all"
                  style={{ width: `${w}%` }}
                />
                <div className="absolute inset-y-0 left-2 flex items-center gap-2 overflow-hidden">
                  <span className="truncate font-mono text-[11px] text-white/75">{s.name}</span>
                </div>
              </div>
              <div className="w-24 shrink-0 text-right">
                <p className="font-mono text-[13px] tabular-nums text-white">{s.entered.toLocaleString()}</p>
                <p className="font-mono text-[10px] tabular-nums text-white/30">
                  {s.rate.toFixed(1)}%
                  {drop !== null && drop > 0 ? <span className="text-red-300/70"> −{drop}</span> : null}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Vital line chart on a shared normalised axis (0..poor threshold per metric).
 *
 * Thresholds are drawn as rules, because "under the line" is the whole
 * judgement a Core Web Vitals chart exists to support.
 */
export function VitalLines({
  series,
  metric,
  good,
  poor,
  height = 170,
}: {
  series: { t: string; lcp: number | null; cls: number | null; inp: number | null }[];
  metric: "lcp" | "cls" | "inp";
  good: number;
  poor: number;
  height?: number;
}) {
  const [i, setI] = useState<number | null>(null);
  const vals = series.map((s) => s[metric]).filter((v): v is number => v !== null);
  if (!vals.length) {
    return (
      <div className="flex items-center justify-center text-[12px] text-white/25" style={{ height }}>
        No samples in this range
      </div>
    );
  }
  const top = Math.max(poor * 1.15, Math.max(...vals) * 1.05);
  const W = 100;
  const step = series.length > 1 ? W / (series.length - 1) : W;
  const y = (v: number) => height - (v / top) * height;

  let d = "";
  let pen = false;
  series.forEach((s, idx) => {
    const v = s[metric];
    if (v === null) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${(idx * step).toFixed(2)},${y(v).toFixed(2)} `;
    pen = true;
  });

  const active = i === null ? null : series[i];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        style={{ height, width: "100%" }}
        role="img"
        aria-label={`${metric.toUpperCase()} over time`}
        onMouseLeave={() => setI(null)}
      >
        {/* good / poor thresholds */}
        <line x1="0" y1={y(good)} x2={W} y2={y(good)} stroke="rgba(52,211,153,0.28)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line x1="0" y1={y(poor)} x2={W} y2={y(poor)} stroke="rgba(248,113,113,0.28)" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        <path d={d} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {active ? (
          <circle
            cx={(i ?? 0) * step}
            cy={active[metric] === null ? 0 : y(active[metric] as number)}
            r="2.5"
            fill="#fff"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>
      {/* Invisible hit areas: one per point, full height, so hover works without
          the user having to hit a 1px line. */}
      <div className="absolute inset-0 flex" onMouseLeave={() => setI(null)}>
        {series.map((s, idx) => (
          <button
            key={idx}
            type="button"
            tabIndex={-1}
            className="flex-1 cursor-default"
            aria-label={`${s.t}: ${s[metric] ?? "no sample"}`}
            onMouseEnter={() => setI(idx)}
            onFocus={() => setI(idx)}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-white/25">
        <span>{series[0]?.t.slice(5, 10)}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-px w-3 bg-emerald-300/50" /> good ≤ {good}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-px w-3 bg-red-300/50" /> poor ≥ {poor}
          </span>
        </span>
        <span>{series[series.length - 1]?.t.slice(5, 10)}</span>
      </div>
      {active ? (
        <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 rounded-md border border-white/10 bg-black/95 px-2.5 py-1.5 whitespace-nowrap">
          <p className="font-mono text-[11px] text-white/50">{active.t.slice(0, 10)}</p>
          <p className="font-mono text-[12px] text-white">
            {active[metric] === null ? "no sample" : `${active[metric]}`}
          </p>
        </div>
      ) : null}
    </div>
  );
}
