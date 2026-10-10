"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart as RBarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ReferenceLine } from "recharts";
import { GRID, AXIS, LABEL } from "./chart-tokens";
import type { Metric } from "@/lib/vitals";

/**
 * Recharts, restyled to Geist.
 *
 * Recharts is the rendering engine and the hit-testing, the animation timing and
 * the accessibility plumbing. Every visible property here is overridden: its
 * default grid, axis and tooltip colours are replaced with Geist's translucent
 * tokens, its 4px radii are replaced with Geist's 2px chart marks, and its
 * default tooltip chrome is not used at all.
 *
 * The two evidence rules from Geist that constrain these charts:
 *
 *  - ONE shared scale per chart. Every peer bar starts and ends on the same grid
 *    lines; only the fill length varies. This is why YAxis has a fixed domain
 *    derived from a rounded maximum rather than Recharts' automatic one.
 *
 *  - DIRECT labels instead of a legend where possible, and every value
 *    reachable in text. The tooltip is additive, never the only route to a
 *    number.
 */

const TICK = { fill: "rgba(255,255,255,0.35)", fontSize: 10, fontFamily: "var(--font-geist-mono)" };

/**
 * Recharts cannot render on the server: ResponsiveContainer measures its own
 * width, and width is zero until the client hydrates. Left alone the chart pops
 * into existence and shoves everything below it down the page, which is a layout
 * shift on every single load.
 *
 * So the height is reserved here and the same empty box is drawn until the real
 * chart mounts. Same pixel footprint, no shift, and the panel reads as loading
 * rather than broken.
 */
function ChartFrame({
  height,
  children,
  label,
}: {
  height: number;
  children: React.ReactNode;
  label: string;
}) {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => setReady(true), []);
  return (
    <div style={{ height }} role="img" aria-label={label}>
      {ready ? (
        children
      ) : (
        <div className="flex size-full items-center justify-center text-[12px] text-white/30">
          Loading chart…
        </div>
      )}
    </div>
  );
}

function roundMax(n: number): number {
  if (n <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(n)));
  return Math.ceil(n / (mag / 2)) * (mag / 2);
}

/** Traffic over time. Pageviews with unique visitors behind, sharing one scale. */
export function TrafficChart({
  data,
  height = 200,
}: {
  data: { label: string; views: number; uniques: number }[];
  height?: number;
}) {
  if (!data.length) return null;
  const domainMax = roundMax(Math.max(...data.map((d) => Math.max(d.views, d.uniques)), 1));

  return (
    <ChartFrame height={height} label="Pageviews and unique visitors over time">
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <defs>
          {/* A single subtle fill. Geist rejects decorative gradients; this one
              encodes the series, so it is a labelled data scale. */}
          <linearGradient id="lmViews" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.16)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="label"
          tick={TICK}
          axisLine={{ stroke: AXIS }}
          tickLine={false}
          minTickGap={28}
        />
        <YAxis
          tick={TICK}
          axisLine={false}
          tickLine={false}
          width={34}
          domain={[0, domainMax]}
        />
        <Tooltip
          cursor={{ stroke: "rgba(255,255,255,0.28)", strokeWidth: 1 }}
          content={<ChartTooltip labels={{ views: "Pageviews", uniques: "Visitors" }} />}
        />
        <Area
          type="monotone"
          dataKey="uniques"
          stroke="rgba(255,255,255,0.28)"
          strokeWidth={1}
          fill="none"
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="views"
          stroke="rgba(255,255,255,0.7)"
          strokeWidth={1.5}
          fill="url(#lmViews)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Category comparison. Shared domain so bar lengths are comparable. */
export function CategoryBars({
  data,
  height = 200,
  valueKey = "value",
}: {
  data: { label: string; value: number }[];
  height?: number;
  valueKey?: string;
}) {
  if (!data.length) return null;
  const domainMax = roundMax(Math.max(...data.map((d) => d.value), 1));

  return (
    <ChartFrame height={height} label="Comparison by category">
    <ResponsiveContainer width="100%" height={height}>
      <RBarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={TICK} axisLine={{ stroke: AXIS }} tickLine={false} minTickGap={12} />
        <YAxis tick={TICK} axisLine={false} tickLine={false} width={34} domain={[0, domainMax]} />
        <Tooltip cursor={{ fill: "rgba(255,255,255,0.05)" }} content={<ChartTooltip />} />
        <Bar dataKey={valueKey} radius={[2, 2, 0, 0]} isAnimationActive={false}>
          {data.map((_, i) => (
            <Cell key={i} fill="rgba(255,255,255,0.30)" />
          ))}
        </Bar>
      </RBarChart>
    </ResponsiveContainer>
    </ChartFrame>
  );
}

/**
 * Core Web Vitals over time with the good and poor thresholds as reference
 * lines — because "under the line" is the judgement the chart exists to
 * support. Threshold colour is paired with a labelled line, never left to hue.
 */
export function VitalChart({
  data,
  metric,
  good,
  poor,
  height = 170,
}: {
  data: { label: string; value: number | null }[];
  metric: Metric;
  good: number;
  poor: number;
  height?: number;
}) {
  const points = data.filter((d): d is { label: string; value: number } => d.value !== null);
  if (!points.length) {
    return (
      <div className="flex items-center justify-center text-[12px] text-white/35" style={{ height }}>
        No samples in this range
      </div>
    );
  }
  const domainMax = roundMax(Math.max(poor * 1.15, ...points.map((p) => p.value)));
  const fmt = metric === "cls" ? (v: number) => v.toFixed(3) : (v: number) => String(Math.round(v));

  return (
    <ChartFrame height={height} label={`${metric.toUpperCase()} over time`}>
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="lmVital" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.14)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={TICK} axisLine={{ stroke: AXIS }} tickLine={false} minTickGap={24} />
        <YAxis
          tick={TICK}
          axisLine={false}
          tickLine={false}
          width={38}
          domain={[0, domainMax]}
          tickFormatter={(v: number) => fmt(v)}
        />
        <ReferenceLine y={good} stroke="rgba(52,211,153,0.4)" strokeDasharray="0" />
        <ReferenceLine y={poor} stroke="rgba(248,113,113,0.4)" strokeDasharray="4 3" />
        <Tooltip
          cursor={{ stroke: "rgba(255,255,255,0.28)", strokeWidth: 1 }}
          content={<ChartTooltip unit={metric === "cls" ? "" : "ms"} />}
        />
        <Area
          type="monotone"
          dataKey="value"
          connectNulls
          stroke="rgba(255,255,255,0.7)"
          strokeWidth={1.5}
          fill="url(#lmVital)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
    </ChartFrame>
  );
}

/**
 * Tooltip on Geist chrome. Recharts' default tooltip is a white rounded box with
 * a border and shadow, which is the single most visible way a chart betrays that
 * it is wearing someone else's design system.
 */
function ChartTooltip({
  active,
  payload,
  label,
  labels,
  unit = "",
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number | string }[];
  label?: string | number;
  labels?: Record<string, string>;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[6px] border border-white/[0.14] bg-black px-2.5 py-1.5">
      <p className="geist-mono text-[11px] text-white/50">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="geist-mono text-[12px] text-white">
          {typeof p.value === "number" ? p.value.toLocaleString() : p.value} {unit}
          {labels?.[String(p.dataKey)] ? ` ${labels[String(p.dataKey)].toLowerCase()}` : ""}
        </p>
      ))}
    </div>
  );
}

export { LABEL };
