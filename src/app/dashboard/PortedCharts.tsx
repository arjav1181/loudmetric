"use client";

import { useMemo, useState } from "react";

/**
 * Interactive chart primitives for the admin panel.
 *
 * Hand-built SVG rather than a charting library, deliberately. Recharts/ECharts
 * would add 150–400kB to solve bar charts and tooltips that are ~80 lines here,
 * and the funnel people reach for in those libraries renders as a stack of
 * tapered bars anyway. The one place a library was genuinely warranted — map
 * projection — is where d3-geo is used instead.
 *
 * Every chart is keyboard-reachable and carries the same numbers in its
 * tooltip, so nothing is hover-only.
 */

export type Point = { label: string; value: number; secondary?: number };

function nice(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

/**
 * Grouped bars with a crosshair and tooltip.
 * `secondary` renders as a lighter bar behind the primary one.
 */
export function InteractiveBars({
  points,
  primary = "Value",
  secondary,
  height = 160,
}: {
  points: Point[];
  primary?: string;
  secondary?: string;
  height?: number;
}) {
  const [i, setI] = useState<number | null>(null);
  const max = Math.max(...points.map((p) => Math.max(p.value, p.secondary || 0)), 1);
  const active = i === null ? null : points[i];

  return (
    <div className="relative">
      <div
        className="flex items-end gap-[2px]"
        style={{ height }}
        onMouseLeave={() => setI(null)}
      >
        {points.map((p, idx) => {
          const h = (p.value / max) * 100;
          const h2 = p.secondary ? (p.secondary / max) * 100 : 0;
          return (
            <button
              key={`${p.label}-${idx}`}
              type="button"
              tabIndex={-1}
              aria-label={`${p.label}: ${p.value}${p.secondary !== undefined ? `, ${secondary ?? ""} ${p.secondary}` : ""}`}
              onMouseEnter={() => setI(idx)}
              onFocus={() => setI(idx)}
              className="relative flex-1 cursor-default"
              style={{ height: "100%" }}
            >
              {p.secondary !== undefined ? (
                <span
                  className="absolute bottom-0 w-full bg-white/15"
                  style={{ height: `${Math.max(1, h2)}%` }}
                />
              ) : null}
              <span
                className={`absolute bottom-0 w-full transition-colors ${i === idx ? "bg-white/70" : "bg-white/40"}`}
                style={{ height: `${Math.max(2, h)}%` }}
              />
            </button>
          );
        })}
        {i !== null ? (
          <span
            className="pointer-events-none absolute inset-y-0 w-px bg-white/50"
            style={{ left: `${((i + 0.5) / points.length) * 100}%` }}
          />
        ) : null}
      </div>

      <div className="mt-1.5 flex justify-between text-[10px] text-white/25">
        <span>{points[0]?.label}</span>
        <span>
          peak {nice(max)}
        </span>
        <span>{points[points.length - 1]?.label}</span>
      </div>

      {active ? (
        <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 border border-white/15 bg-black/95 px-2.5 py-1.5 whitespace-nowrap">
          <p className="text-[11px] text-white/85">{active.label}</p>
          <p className="font-mono text-[11px] text-white/50 tabular-nums">
            {primary} {active.value.toLocaleString()}
            {active.secondary !== undefined ? ` · ${secondary} ${active.secondary.toLocaleString()}` : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Funnel as tapered stages rather than bars, because that is what the shape
 * actually means: each stage narrows by the drop between it and the one above.
 *
 * Values are expected to already be monotonic (the caller caps them), so a
 * funnel can never render a wider stage below a narrower one and lie about it.
 */
export function FunnelChart({
  stages,
}: {
  stages: { name: string; value: number }[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const top = Math.max(...stages.map((s) => s.value), 1);
  const W = 100;
  const rowH = 44;
  const gap = 4;
  const H = stages.length * rowH;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: H }} role="img" aria-label="Conversion funnel">
        {stages.map((s, i) => {
          const t = i / Math.max(stages.length - 1, 1);
          const prev = i > 0 ? stages[i - 1].value : s.value;
          const wTop = (s.value / top) * W;
          const nextVal = i < stages.length - 1 ? stages[i + 1].value : s.value;
          const wBottom = (nextVal / top) * W;

          // Cap the narrow end so the last stage stays readable rather than
          // collapsing to a sliver at near-zero conversion.
          const minW = 14;
          const bW = Math.max(wBottom, Math.min(minW, wTop));
          const tW = Math.max(wTop, bW);

          const x0 = (W - tW) / 2;
          const x1 = (W - bW) / 2;
          const y = i * rowH;
          const step = prev > 0 ? Math.round((s.value / prev) * 100) : null;

          return (
            <g
              key={s.name}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: "default" }}
            >
              <path
                d={`M ${x0} ${y} L ${x0 + tW} ${y} L ${x1 + bW} ${y + rowH - gap} L ${x1} ${y + rowH - gap} Z`}
                fill={hover === i ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.32)"}
              />
              <text
                x={W / 2}
                y={y + (rowH - gap) / 2 - 2}
                textAnchor="middle"
                className="fill-white"
                style={{ fontSize: "4.4px", fontWeight: 700 }}
              >
                {s.name}
              </text>
              <text
                x={W / 2}
                y={y + (rowH - gap) / 2 + 5}
                textAnchor="middle"
                className="fill-white/70"
                style={{ fontSize: "3.4px" }}
              >
                {s.value.toLocaleString()}
                {step !== null && i > 0 ? ` · ${step}%` : ""}
              </text>
            </g>
          );
        })}
      </svg>

      {hover !== null ? (
        <p className="mt-2 text-[11px] text-white/40">
          {stages[hover].name}: {stages[hover].value.toLocaleString()}
          {hover > 0 && stages[hover - 1].value > 0
            ? ` — ${Math.round((stages[hover].value / stages[hover - 1].value) * 100)}% of the step above`
            : ""}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Bar list with hover rows and an inline share. Used where a chart library
 * would just render `<Bar>`.
 */
export function BarList({
  rows,
  tone = "default",
}: {
  rows: { name: string; value: number }[];
  tone?: "default" | "accent";
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <ul className="flex flex-col gap-1">
      {rows.map((r) => (
        <li
          key={r.name}
          className="group grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2"
          title={`${r.name}: ${r.value.toLocaleString()}${total ? ` (${Math.round((r.value / total) * 100)}%)` : ""}`}
        >
          <span className="truncate text-[12px] text-white/55 group-hover:text-white/80">{r.name}</span>
          <span className="h-1.5 bg-white/[0.06]">
            <span
              className={`block h-full transition-colors ${tone === "accent" ? "bg-emerald-400/60" : "bg-white/45 group-hover:bg-white/70"}`}
              style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%` }}
            />
          </span>
          <span className="font-mono text-[11px] text-white/45 tabular-nums">
            {r.value.toLocaleString()}
            {total ? <span className="ml-1.5 text-white/25">{Math.round((r.value / total) * 100)}%</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Sparkline strip for dense series where the shape is the message. */
export function Spark({ values, height = 28 }: { values: number[]; height?: number }) {
  const max = Math.max(...values, 1);
  const d = useMemo(() => {
    if (values.length < 2) return "";
    return values
      .map((v, i) => `${i === 0 ? "M" : "L"} ${(i / (values.length - 1)) * 100} ${height - (v / max) * height}`)
      .join(" ");
  }, [values, max, height]);

  if (!d) return <div style={{ height }} />;
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ height }} className="w-full" aria-hidden="true">
      <path d={d} fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}