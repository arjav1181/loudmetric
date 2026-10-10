"use client";

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CommandPalette } from "./PortedPalette";
import { SidebarNav } from "./PortedNav";
import { Spark } from "./PortedUI";

/**
 * Client shell state: range, auto-refresh, and the mobile sidebar.
 *
 * The range lives in the URL (?range=30d) rather than only in React state, so
 * a filtered view is linkable, survives a reload, and is shared with the CSV
 * export endpoint — which has no access to client state.
 */

type Ctx = {
  range: string;
  setRange: (r: string) => void;
  autoRefresh: boolean;
  setAutoRefresh: (v: boolean) => void;
  lastUpdated: string | null;
  markUpdated: (iso: string) => void;
  unread?: number;
  setUnread: (n: number) => void;
  refreshNonce: number;
  triggerRefresh: () => void;
};

const AdminCtx = createContext<Ctx | null>(null);

export function useAdmin() {
  const ctx = useContext(AdminCtx);
  if (!ctx) throw new Error("useAdmin must be used inside AdminShell");
  return ctx;
}

export function AdminShell({
  children,
  unread: initialUnread = 0,
  health,
  sites = [],
}: {
  children: React.ReactNode;
  unread?: number;
  /**
   * Live counts for this instance.
   *
   * The portfolio used this slot for its own GitHub star count. LoudMetric has
   * no repos to count and no external call to make, so it shows this
   * installation's own live visitors instead — the same "is anything happening
   * right now" glance, from data we actually have rather than data we fetch
   * from somewhere else.
   */
  health: { kv: boolean; lcp: number | null; live: number; events: number };
  /** Site switcher rendered under the section nav in the rail. */
  sites?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [range, setRangeState] = useState("30d");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [unread, setUnread] = useState(initialUnread);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("range");
    if (r) setRangeState(r);
  }, []);

  const setRange = useCallback(
    (r: string) => {
      setRangeState(r);
      const url = new URL(window.location.href);
      url.searchParams.set("range", r);
      router.replace(url.pathname + url.search, { scroll: false });
      setRefreshNonce((n) => n + 1);
    },
    [router],
  );

  const triggerRefresh = useCallback(() => setRefreshNonce((n) => n + 1), []);

  const logout = useCallback(async () => {
    await fetch("/api/admin/session", { method: "DELETE" });
    window.location.href = "/dashboard";
  }, []);

  // Auto-refresh: 60s, paused while the tab is hidden so a backgrounded panel
  // does not keep hitting KV.
  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setRefreshNonce((n) => n + 1);
    }, 60_000);
    return () => window.clearInterval(id);
  }, [autoRefresh]);

  const value = useMemo<Ctx>(
    () => ({
      range,
      setRange,
      autoRefresh,
      setAutoRefresh,
      lastUpdated,
      markUpdated: setLastUpdated,
      unread,
      setUnread,
      refreshNonce,
      triggerRefresh,
    }),
    [range, setRange, autoRefresh, lastUpdated, unread, refreshNonce, triggerRefresh],
  );

  return (
    <AdminCtx.Provider value={value}>
      <div className="min-h-dvh bg-black text-white">
        {/* Status strip — the thing you glance at before anything else. */}
        <div className="sticky top-0 z-50 border-b border-white/10 bg-black/95 backdrop-blur">
          <div className="flex items-center gap-3 px-3 py-2">
            <button
              type="button"
              onClick={() => setMobileNav((v) => !v)}
              className="shrink-0 border border-white/10 p-1.5 text-white/50 lg:hidden"
              aria-label="Toggle navigation"
              aria-expanded={mobileNav}
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M2 4h12M2 8h12M2 12h12" />
              </svg>
            </button>

            <a href="/dashboard" className="hidden shrink-0 font-bold tracking-[-0.02em] lg:block">
              Admin
            </a>

            <div className="hidden min-w-0 flex-1 items-center gap-4 md:flex">
              <HealthPill label="Store" ok={health.kv} okText="connected" badText="no store" />
              <HealthPill
                label="LCP p50"
                ok={health.lcp !== null && health.lcp <= 2500}
                okText={health.lcp ? `${(health.lcp / 1000).toFixed(2)}s` : "—"}
                badText={health.lcp ? `${(health.lcp / 1000).toFixed(2)}s` : "—"}
                warn={health.lcp !== null && health.lcp > 2500}
              />
                <span
                  className="flex items-center gap-1.5 text-[11px] text-white/40"
                  title="Visitors seen in the last 5 minutes, and total events stored"
                >
                  <span className="text-white/30">{health.live}</span>
                  <span className="text-white/20">live</span>
                  <span className="text-white/20">·</span>
                  <span className="text-white/30">{health.events.toLocaleString()} events</span>
                </span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <span className="hidden font-mono text-[10px] text-white/25 sm:inline">
                {lastUpdated ? new Date(lastUpdated).toLocaleTimeString("en-GB") : "—"}
              </span>
              <button
                type="button"
                onClick={triggerRefresh}
                className="border border-white/10 px-2 py-1.5 text-[11px] text-white/45 transition-colors hover:border-white/30 hover:text-white/80"
                title="Refresh (r)"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => setAutoRefresh(!autoRefresh)}
                aria-pressed={autoRefresh}
                className={`border px-2 py-1.5 text-[11px] transition-colors ${
                  autoRefresh
                    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                    : "border-white/10 text-white/45 hover:border-white/30 hover:text-white/80"
                }`}
                title="Auto-refresh every 60s"
              >
                Live
              </button>
              <button
                type="button"
                onClick={logout}
                className="border border-white/10 px-2 py-1.5 text-[11px] text-white/45 transition-colors hover:border-white/30 hover:text-white/80"
                title="Sign out"
              >
                Out
              </button>
            </div>
          </div>
        </div>

        <div className="flex">
          {/* Sidebar: fixed on desktop, slide-over on a phone. */}
          <aside
            className={`fixed inset-y-0 left-0 z-40 w-60 shrink-0 overflow-y-auto border-r border-white/10 bg-black px-3 pb-8 pt-4 lg:sticky lg:top-[41px] lg:h-[calc(100dvh-41px)] lg:translate-x-0 ${
              mobileNav ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="mb-4 hidden lg:block">
              <CommandPalette
                refresh={triggerRefresh}
                autoRefresh={autoRefresh}
                setAutoRefresh={setAutoRefresh}
                setRange={setRange}
                onLogout={logout}
              />
            </div>

            <SidebarNav onNavigate={() => setMobileNav(false)} />

            <div className="mt-6 border-t border-white/[0.07] pt-4">
              <p className="px-3 text-[10px] tracking-[0.2em] text-white/25 uppercase">Keys</p>
              <ul className="mt-2 flex flex-col gap-1 px-3 text-[11px] text-white/30">
                <li><Kbd>⌘K</Kbd> palette</li>
                <li><Kbd>O A B C I T</Kbd> sections</li>
                <li><Kbd>R</Kbd> refresh</li>
              </ul>
            </div>

            <a
              href="/"
              className="mt-6 block border-t border-white/[0.07] px-3 pt-4 text-[11px] text-white/25 transition-colors hover:text-white/60"
            >
              ← View site
            </a>
          </aside>

          {mobileNav ? (
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setMobileNav(false)}
              className="fixed inset-0 z-30 bg-black/70 lg:hidden"
            />
          ) : null}

          <main className="min-w-0 flex-1 px-3 py-4 sm:px-4 lg:px-6">{children}</main>
        </div>
      </div>
    </AdminCtx.Provider>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mr-1.5 border border-white/12 bg-white/[0.04] px-1 py-0.5 font-mono text-[10px] text-white/45">
      {children}
    </kbd>
  );
}

function HealthPill({
  label,
  ok,
  okText,
  badText,
  warn = false,
}: {
  label: string;
  ok: boolean;
  okText: string;
  badText: string;
  warn?: boolean;
}) {
  const tone = ok ? (warn ? "text-amber-300/80" : "text-emerald-300/70") : "text-red-300/80";
  return (
    <span className="flex items-center gap-1.5 text-[11px]">
      <span className="text-white/25">{label}</span>
      <span className={`font-mono ${tone}`}>{ok ? okText : badText}</span>
    </span>
  );
}

export { Spark };