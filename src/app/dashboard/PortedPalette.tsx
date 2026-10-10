"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NAV } from "./PortedNav";

type Cmd = {
  id: string;
  label: string;
  group: "Sections" | "Ranges" | "Actions";
  hint?: string;
  run: () => void;
};

export const RANGES = [
  { key: "24h", label: "Last 24 hours" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
];

/**
 * Command palette + global keyboard shortcuts.
 *
 * Shortcuts are the point: in a panel you visit daily, typing "b" to jump to
 * Behaviour is faster than aiming at a sidebar. Every shortcut is also a real
 * focusable control, so this is an accelerator rather than the only route to
 * anything.
 */
export function CommandPalette({
  refresh,
  autoRefresh,
  setAutoRefresh,
  setRange,
  onLogout,
}: {
  refresh: () => void;
  autoRefresh: boolean;
  setAutoRefresh: (v: boolean) => void;
  setRange: (r: string) => void;
  onLogout: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Cmd[] = [
    ...NAV.map((n) => ({
      id: `go:${n.href}`,
      label: n.label,
      group: "Sections" as const,
      hint: n.hint,
      run: () => router.push(n.href),
    })),
    ...RANGES.map((r) => ({
      id: `range:${r.key}`,
      label: r.label,
      group: "Ranges" as const,
      run: () => setRange(r.key),
    })),
    { id: "act:refresh", label: "Refresh data now", group: "Actions" as const, run: refresh },
    {
      id: "act:auto",
      label: autoRefresh ? "Turn off auto-refresh" : "Turn on auto-refresh",
      group: "Actions" as const,
      run: () => setAutoRefresh(!autoRefresh),
    },
    { id: "act:logout", label: "Sign out", group: "Actions" as const, run: onLogout },
  ];

  const filtered = commands.filter((c) => {
    if (!q) return true;
    return c.label.toLowerCase().includes(q.toLowerCase()) || c.group.toLowerCase().includes(q.toLowerCase());
  });

  const close = () => {
    setOpen(false);
    setQ("");
    setCursor(0);
  };

  const fire = (c: Cmd | undefined) => {
    if (!c) return;
    c.run();
    close();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable);

      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
        return;
      }
      if (typing) return;

      // Single-key section jumps, the way a dashboard should behave.
      const byKey: Record<string, string> = {
        o: "/dashboard",
        a: "/dashboard/pages",
        b: "/dashboard/engagement",
        c: "/dashboard/vitals",
        i: "/dashboard/copilot",
        t: "/dashboard/funnels",
      };
      const target = byKey[e.key.toLowerCase()];
      if (target && target !== pathname) {
        e.preventDefault();
        router.push(target);
      }
      if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        refresh();
      }
      if (e.key === "?") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pathname, refresh, router]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setCursor(0);
  }, [q]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 border border-white/10 bg-white/[0.02] px-3 py-2 text-left text-white/35 transition-colors hover:border-white/25 hover:text-white/60"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5L14 14" />
        </svg>
        <span className="flex-1 text-[12px]">Search or jump to…</span>
        <kbd className="shrink-0 border border-white/15 px-1.5 py-0.5 font-mono text-[10px] text-white/35">
          ⌘K
        </kbd>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[200] flex items-start justify-center px-4 pt-[12vh]"
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
        >
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <div className="relative w-full max-w-lg border border-white/15 bg-black shadow-2xl">
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setCursor((c) => Math.min(filtered.length - 1, c + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setCursor((c) => Math.max(0, c - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  fire(filtered[cursor]);
                }
              }}
              placeholder="Sections, ranges, actions…"
              className="w-full border-b border-white/10 bg-transparent px-4 py-3 text-sm text-white/85 outline-none placeholder:text-white/25"
            />
            <ul className="max-h-72 overflow-auto py-1" role="listbox">
              {filtered.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-white/30">No matches.</li>
              ) : (
                filtered.map((c, i) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => fire(c)}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                        i === cursor ? "bg-white/[0.06] text-white" : "text-white/55"
                      }`}
                    >
                      <span className="w-16 shrink-0 text-[9px] tracking-[0.15em] text-white/25 uppercase">
                        {c.group}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px]">{c.label}</span>
                      {c.hint ? <span className="shrink-0 text-[10px] text-white/25">{c.hint}</span> : null}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}