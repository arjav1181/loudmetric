"use client";

import { useEffect, useState } from "react";

/**
 * Login gate for the admin panel.
 *
 * Exchanges STATS_KEY once for an httpOnly session cookie. The key is never
 * placed in a URL, so it stops leaking into browser history, referrers and
 * shared links the way the old `?key=` scheme did.
 */
export function LoginGate({ enabled }: { enabled: boolean }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !busy) submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, busy]);

  async function submit() {
    if (!value || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: value }),
      });
      if (res.ok) {
        window.location.href = "/admin";
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error === "unauthorized" ? "That key is not right." : "Could not sign in.");
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <p className="text-[10px] tracking-[0.25em] text-white/30 uppercase">Private</p>
        <h1 className="mt-3 text-2xl font-bold tracking-[-0.02em] text-white">Admin</h1>

        {!enabled ? (
          <div className="mt-6 border border-amber-400/25 bg-amber-400/[0.06] p-4">
            <p className="text-sm text-amber-200/90">
              <code className="text-amber-100">STATS_KEY</code> is not set, so this panel is
              disabled. Set it in Vercel and redeploy.
            </p>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-white/40">
              Enter your key to continue. It is exchanged for a session cookie and never
              appears in the URL again.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="mt-6"
            >
              <label htmlFor="admin-key" className="text-[10px] tracking-[0.2em] text-white/40 uppercase">
                Key
              </label>
              <input
                id="admin-key"
                type="password"
                autoFocus
                autoComplete="current-password"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="mt-2 w-full border border-white/10 bg-black/40 px-3 py-2.5 font-mono text-sm text-white/80 outline-none transition-colors placeholder:text-white/20 focus:border-white/40"
                placeholder="••••••••"
              />
              {error ? <p className="mt-2 text-xs text-red-300/85">{error}</p> : null}
              <button
                type="submit"
                disabled={busy || !value}
                className="mt-4 w-full border border-white/20 px-4 py-2.5 text-[11px] tracking-[0.18em] uppercase transition-colors hover:border-white/50 hover:text-white disabled:opacity-40"
              >
                {busy ? "Checking…" : "Sign in"}
              </button>
            </form>
          </>
        )}

        <a
          href="/"
          className="mt-8 inline-block text-[11px] tracking-[0.15em] text-white/25 uppercase transition-colors hover:text-white/60"
        >
          ← Back to site
        </a>
      </div>
    </div>
  );
}