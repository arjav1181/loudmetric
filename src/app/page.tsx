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
    <div className="wrap">
      <p className="label">Self-hosted · cookie-free · MIT</p>
      <h1 className="h1">LoudMetric</h1>
      <p className="sub" style={{ maxWidth: "42rem", marginTop: "1rem" }}>
        Analytics that tells you what people actually read, and how fast your site really is —
        without setting a cookie or sending anyone a single byte about them.
      </p>

      <div className="card" style={{ marginTop: "2rem" }}>
        <p className="label">Add a site</p>
        <form onSubmit={create} style={{ display: "grid", gap: ".75rem", marginTop: ".9rem" }}>
          <div>
            <label className="label" htmlFor="name" style={{ display: "block", marginBottom: ".4rem" }}>
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
            <label className="label" htmlFor="domain" style={{ display: "block", marginBottom: ".4rem" }}>
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
            <button type="submit" className="btn" disabled={busy || !name.trim()}>
              {busy ? "Creating…" : "Create site"}
            </button>
          </div>
        </form>
        {err ? <p className="err" style={{ marginTop: ".8rem" }}>{err}</p> : null}
      </div>

      <div className="card">
        <p className="label">Your sites</p>
        {loading ? (
          <p className="sub" style={{ marginTop: ".8rem" }}>Loading…</p>
        ) : sites.length === 0 ? (
          <p className="sub" style={{ marginTop: ".8rem" }}>
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
                <p className="mono" style={{ fontSize: 11, color: "rgba(255,255,255,.3)", marginTop: ".5rem" }}>
                  key {s.write_key} · <a href={`/sites/${s.id}`}>open dashboard →</a>
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: "2rem" }}>
        <p className="label">Where the data goes</p>
        <p className="sub" style={{ marginTop: ".7rem" }}>
          Every site above has a full dashboard: traffic, pages, scroll depth, section engagement,
          real Core Web Vitals, funnels, events, and anomaly detection. Open it from the button
          beside any site.
        </p>
      </div>

      <p className="sub" style={{ marginTop: "2rem", fontSize: 13 }}>
        No cookies. No fingerprinting. IPs are hashed against a salt that rotates daily, so
        yesterday&rsquo;s visitors cannot be joined to today&rsquo;s.{" "}
        <a href="https://github.com/arjav1181/loudmetric" style={{ textDecoration: "underline" }}>
          Source
        </a>
      </p>
    </div>
  );
}