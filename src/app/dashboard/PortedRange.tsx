"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "./PortedShell";
import { RANGES } from "./PortedPalette";
import { Chip } from "./PortedUI";

/**
 * Range picker.
 *
 * Writes to the URL (via the shell context) so a filtered view is linkable and
 * the CSV export, which is a plain link, inherits the same range.
 */
export function RangePicker() {
  const { range, setRange } = useAdmin();
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    if (range === "custom") setCustom(true);
  }, [range]);

  const applyCustom = () => {
    if (!from || !to) return;
    const url = new URL(window.location.href);
    url.searchParams.set("range", "custom");
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    window.location.href = url.pathname + url.search;
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex border border-white/10">
        {RANGES.map((r) => (
          <Chip key={r.key} active={range === r.key} onClick={() => setRange(r.key)}>
            {r.key.replace("d", "d")}
          </Chip>
        ))}
        <Chip active={custom} onClick={() => setCustom((v) => !v)} title="Pick an exact window">
          Custom
        </Chip>
      </div>

      {custom ? (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className="border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11px] text-white/70 outline-none focus:border-white/35"
          />
          <span className="text-white/25">→</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className="border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11px] text-white/70 outline-none focus:border-white/35"
          />
          <button
            type="button"
            onClick={applyCustom}
            className="border border-white/20 px-2 py-1 text-[11px] text-white/60 transition-colors hover:border-white/50 hover:text-white"
          >
            Apply
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Label explaining exactly what the current range covers. */
export function RangeNote({ label, from, to, days }: { label: string; from: string; to: string; days: number }) {
  return (
    <p className="text-[11px] text-white/30">
      {label} ·{" "}
      <span className="font-mono text-white/45">
        {from} → {to}
      </span>{" "}
      ({days} days)
    </p>
  );
}