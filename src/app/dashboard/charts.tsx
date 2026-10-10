"use client";

import { useState } from "react";

/**
 * Charts, built as SVG against Geist tokens.
 *
 * Two rules from the Geist evidence guidance shape all of this:
 *
 *  - Repeated bars share ONE scale and ONE track geometry. Every row starts and
 *    ends on the same grid lines; only the fill length varies. Rows that size
 *    themselves to their label are not a chart.
 *
 *  - Direct labels instead of a legend, and every value reachable without a
 *    hover, because a tooltip-only number is invisible to a screen reader and
 *    to anyone inspecting the page as text.
 */

export type Point = { label: string; value: number; secondary?: number };

const TRACK = "rgba(255,255,255,0.06)";
const FILL = "rgba(255,255,255,0.30)";
const FILL_SECONDARY = "rgba(255,255,255,0.14)";
const AXIS = "rgba(255,255,255,0.25)";

function nice(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

/** Axis ticks on round numbers. 0/37/74 reads as noise. */
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

/** Grouped bars with a crosshair. Keyboard reachable, values in the tooltip. */
export function InteractiveBars({
  points,
  primary = "Pageviews",
  secondary,
  height = 180,
}: {
  points: Point[];
  primary?: string;
  secondary?: string;
  height?: number;
}) {
  const [i, setI] = useState<number | null>(null);
  const max = Math.max(...points.map((p) => Math.max(p.value, p.secondary ?? 0)), 1);
  const grid = ticksFor(max);
  const top = grid[grid.length - 1] || 1;
  const active = i === null ? null : points[i];

  return (
    <div className="relative">
      <div
        className="relative flex items-end gap-[2px]"
        style={{ height }}
        onMouseLeave={() => setI(null)}
      >
        {grid.map((g) => (
          <div
            key={g}
            className="pointer-events-none absolute inset-x-0 border-t border-white/[0.06]"
            style={{ bottom: `${(g / top) * 100}%` }}
          >
            <span className="geist-mono absolute right-0 -top-4 text-[10px] text-white/25">
              {nice(g)}
            </span>
          </div>
        ))}
        {points.map((p, idx) => {
          const h = (p.value / top) * 100;
          const h2 = p.secondary !== undefined ? (p.secondary / top) * 100 : 0;
          return (
            <button
              key={`${p.label}-${idx}`}
              type="button"
              tabIndex={-1}
              aria-label={`${p.label}: ${p.value}${p.secondary !== undefined ? `, ${secondary} ${p.secondary}` : ""}`}
              onMouseEnter={() => setI(idx)}
              onFocus={() => setI(idx)}
              className="relative flex-1 cursor-default"
              style={{ height: "100%" }}
            >
              {p.secondary !== undefined ? (
                <span
                  className="absolute bottom-0 w-full rounded-t-[2px]"
                  style={{ height: `${Math.max(1, h2)}%`, background: FILL_SECONDARY }}
                />
              ) : null}
              <span
                className="absolute bottom-0 w-full rounded-t-[2px] transition-colors"
                style={{
                  height: `${Math.max(1, h)}%`,
                  background: i === null ? FILL : i === idx ? "rgba(255,255,255,0.75)" : FILL_SECONDARY,
                }}
              />
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between font-mono text-[10px] text-white/30">
        {points.length ? (
          <>
            <span>{points[0].label}</span>
            {points.length > 2 ? <span>{points[Math.floor(points.length / 2)].label}</span> : null}
            <span>{points[points.length - 1].label}</span>
          </>
        ) : null}
      </div>

      {active ? (
        <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 rounded border border-white/10 bg-black px-2.5 py-1.5 whitespace-nowrap">
          <p className="geist-mono text-[11px] text-white/50">{active.label}</p>
          <p className="geist-mono text-[12px] text-white">
            {active.value.toLocaleString()} {primary.toLowerCase()}
          </p>
          {active.secondary !== undefined ? (
            <p className="geist-mono text-[12px] text-white/60">
              {active.secondary.toLocaleString()} {secondary?.toLowerCase()}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-4 border-t border-white/[0.06] pt-2.5">
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-white/40">
          <span className="h-2 w-2 rounded-[2px]" style={{ background: FILL }} /> {primary}
        </span>
        {secondary ? (
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-white/40">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: FILL_SECONDARY }} /> {secondary}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Tapered funnel. Width encodes the value, so a steep drop is visible as a
 * shape rather than only as a number.
 */
export function FunnelChart({
  stages,
  height = 200,
}: {
  stages: { name: string; value: number }[];
  height?: number;
}) {
  const top = Math.max(...stages.map((s) => s.value), 1);
  const gap = 8;
  const barH = Math.max(
    22,
    Math.min(52, (height - gap * Math.max(stages.length - 1, 0)) / Math.max(stages.length, 1)),
  );

  return (
    <div className="space-y-2">
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1].value : null;
        const drop = prev !== null && prev > 0 ? Math.round((1 - s.value / prev) * 1000) / 10 : null;
        return (
          <div key={s.name} style={{ height: barH }}>
            <div className="flex h-full items-center gap-3">
              <div className="relative h-full flex-1">
                <div
                  className="absolute inset-y-0 rounded-[2px] bg-white/[0.14]"
                  style={{ width: `${Math.max(12, (s.value / top) * 100)}%` }}
                />
                <div className="absolute inset-y-0 left-2 flex items-center overflow-hidden">
                  <span className="geist-mono truncate text-[11px] text-white/70">{s.name}</span>
                </div>
              </div>
              <div className="w-20 shrink-0 text-right">
                <p className="geist-mono text-[13px] tabular-nums text-white">{s.value.toLocaleString()}</p>
                {drop !== null && drop > 0 ? (
                  <p className="geist-mono text-[10px] tabular-nums text-white/35">−{drop}%</p>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Core Web Vitals over time, on a normalised axis with the good and poor
 * thresholds drawn as rules — because "under the line" is the entire judgement
 * this chart exists to support.
 */
export function VitalLines({
  series,
  metric,
  good,
  poor,
  height = 150,
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
      <div className="flex items-center justify-center text-[12px] text-white/30" style={{ height }}>
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
      >
        <line x1="0" y1={y(good)} x2={W} y2={y(good)} stroke="rgba(52,211,153,0.35)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line x1="0" y1={y(poor)} x2={W} y2={y(poor)} stroke="rgba(248,113,113,0.35)" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        <path d={d} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
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
      <div className="mt-2 flex justify-between font-mono text-[10px] text-white/30">
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
        <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 rounded border border-white/10 bg-black px-2.5 py-1.5 whitespace-nowrap">
          <p className="geist-mono text-[11px] text-white/50">{active.t.slice(0, 10)}</p>
          <p className="geist-mono text-[12px] text-white">
            {active[metric] === null ? "no sample" : active[metric]}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export { TRACK, AXIS };
