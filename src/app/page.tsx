"use client";

import { useEffect, useState } from "react";

type Site = { id: string; name: string; domain: string | null; write_key: string; created_at: string };

export default function Home() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    load();
    async function load() {
      try {
        const res = await fetch("/api/sites");
        const data = await res.json();
        if (res.ok) setSites(data.sites || []);
        else setErr(data.message || "Could not reach the database. Is it running?");
      } catch {
        setErr("Could not reach the server.");
      } finally {
        setLoading(false);
      }
    }
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, domain }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.message || data.error || "Could not create the site.");
        return;
      }
      setSites((s) => [data.site, ...s]);
      setName("");
      setDomain("");
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  };

  const snippet = (key: string) =>
    `<script\n  async\n  src="${origin}/loudmetric.js"\n  data-site="${key}"\n  data-endpoint="${origin}/api/ingest"\n></script>`;

  return (
    <div className="mx-auto w-full max-w-[60rem] px-5 py-12">
      <p className="geist-label">Self-hosted · cookie-free · MIT</p>
      <h1 className="mt-2 text-[32px] font-semibold leading-tight tracking-[-0.03em]">LoudMetric</h1>
      <p className="mt-3 max-w-[42rem] text-[14px] leading-[1.6] text-white/55" style={{ maxWidth: "42rem", marginTop: "1rem" }}>
        Analytics that tells you what people actually read, and how fast your site really is —
        without setting a cookie or sending anyone a single byte about them.
      </p>

      <div className="geist-panel p-5" style={{ marginTop: "2rem" }}>
        <p className="geist-label">Add a site</p>
        <form onSubmit={create} style={{ display: "grid", gap: ".75rem", marginTop: ".9rem" }}>
          <div>
            <label className="geist-label" htmlFor="name" style={{ display: "block", marginBottom: ".4rem" }}>
              Name
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My portfolio"
            />
          </div>
          <div>
            <label className="geist-label" htmlFor="domain" style={{ display: "block", marginBottom: ".4rem" }}>
              Domain (optional)
            </label>
            <input
              id="domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
            />
          </div>
          <div>
            <button type="submit" className="geist-btn geist-btn-primary" disabled={busy || !name.trim()}>
              {busy ? "Creating…" : "Create site"}
            </button>
          </div>
        </form>
        {err ? <p className="text-[12px] text-red-300/90" style={{ marginTop: ".8rem" }}>{err}</p> : null}
      </div>

      <div className="geist-panel p-5">
        <p className="geist-label">Your sites</p>
        {loading ? (
          <p className="mt-3 max-w-[42rem] text-[14px] leading-[1.6] text-white/55" style={{ marginTop: ".8rem" }}>Loading…</p>
        ) : sites.length === 0 ? (
          <p className="mt-3 max-w-[42rem] text-[14px] leading-[1.6] text-white/55" style={{ marginTop: ".8rem" }}>
            No sites yet. Create one above and paste the snippet into your <code>&lt;head&gt;</code>.
          </p>
        ) : (
          <div style={{ marginTop: ".8rem", display: "grid", gap: "1.25rem" }}>
            {sites.map((s) => (
              <div key={s.id}>
                <p style={{ margin: "0 0 .5rem", fontWeight: 700 }}>
                  {s.name}
                  {s.domain ? <span style={{ color: "rgba(255,255,255,.35)", fontWeight: 400 }}> · {s.domain}</span> : null}
                </p>
                <pre>{snippet(s.write_key)}</pre>
                <div
                  className="geist-mono"
                  style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,.3)",
                    marginTop: ".6rem",
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <span>key {s.write_key}</span>
                  <a
                    href={`/dashboard?site=${s.id}`}
                    style={{
                      border: "1px solid rgba(255,255,255,.22)",
                      borderRadius: 5,
                      padding: "4px 9px",
                      color: "rgba(255,255,255,.75)",
                      textTransform: "uppercase",
                      letterSpacing: ".1em",
                      textDecoration: "none",
                    }}
                  >
                    Open dashboard
                  </a>
                  <a href={`/sites/${s.id}`} style={{ textDecoration: "none" }}>
                    event log →
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="geist-panel p-5" style={{ marginTop: "2rem" }}>
        <p className="geist-label">Where the data goes</p>
        <p className="mt-3 max-w-[42rem] text-[14px] leading-[1.6] text-white/55" style={{ marginTop: ".7rem" }}>
          Every site above has a full dashboard: traffic, pages, scroll depth, section engagement,
          real Core Web Vitals, funnels, events, and anomaly detection. Open it from the button
          beside any site.
        </p>
      </div>

      <p className="mt-3 max-w-[42rem] text-[14px] leading-[1.6] text-white/55" style={{ marginTop: "2rem", fontSize: 13 }}>
        No cookies. No fingerprinting. IPs are hashed against a salt that rotates daily, so
        yesterday&rsquo;s visitors cannot be joined to today&rsquo;s.{" "}
        <a href="https://github.com/arjav1181/loudmetric" style={{ textDecoration: "underline" }}>
          Source
        </a>
      </p>
    </div>
  );
}