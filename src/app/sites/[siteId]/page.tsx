import { headers } from "next/headers";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * A deliberately honest placeholder, not a stub pretending to be a dashboard.
 *
 * The real dashboard is the next milestone. This proves the thing that matters
 * for the "clone → run → see data" promise: that events written by the snippet
 * land in Postgres and come back out queryable.
 */
export default async function SitePage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const h = await headers();
  const host = h.get("host") || "localhost:3000";

  let site: { name: string; write_key: string; domain: string | null } | null = null;
  let counts: { type: string; n: number }[] = [];
  let error = "";

  try {
    const s = await getPool().query("SELECT name, write_key, domain FROM sites WHERE id = $1", [siteId]);
    site = s.rows[0] ?? null;
    if (site) {
      const c = await getPool().query(
        "SELECT type, count(*)::int AS n FROM events WHERE site_id = $1 GROUP BY type ORDER BY n DESC",
        [siteId],
      );
      counts = c.rows;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "unknown";
  }

  if (error) {
    return (
      <div className="wrap">
        <h1 className="h1">Database unavailable</h1>
        <p className="sub" style={{ marginTop: "1rem" }}>{error}</p>
      </div>
    );
  }
  if (!site) {
    return (
      <div className="wrap">
        <h1 className="h1">No such site</h1>
        <p className="sub" style={{ marginTop: "1rem" }}>
          <a href="/">← Back to your sites</a>
        </p>
      </div>
    );
  }

  const total = counts.reduce((s, r) => s + r.n, 0);
  const snippet = `<script\n  async\n  src="http://${host}/loudmetric.js"\n  data-site="${site.write_key}"\n  data-endpoint="http://${host}/api/ingest"\n></script>`;

  return (
    <div className="wrap">
      <p className="label">{site.domain || "no domain set"}</p>
      <h1 className="h1">{site.name}</h1>

      <div className="card">
        <p className="label">Events received</p>
        {total === 0 ? (
          <>
            <p className="sub" style={{ marginTop: ".8rem" }}>
              Nothing yet. Paste the snippet into your site, then visit it — events should appear
              here within a second.
            </p>
            <pre style={{ marginTop: ".9rem" }}>{snippet}</pre>
          </>
        ) : (
          <table style={{ marginTop: ".8rem" }}>
            <thead>
              <tr><th>Type</th><th>Count</th></tr>
            </thead>
            <tbody>
              {counts.map((c) => (
                <tr key={c.type}>
                  <td className="mono">{c.type}</td>
                  <td className="mono">{c.n.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <p className="label">Next</p>
        <p className="sub" style={{ marginTop: ".6rem" }}>
          The full dashboard — traffic, funnels, section engagement, Core Web Vitals and the AI
          copilot — is the next milestone. This page exists to prove the pipeline end to end:
          snippet → ingest → Postgres → back out again.
        </p>
      </div>

      <p className="sub" style={{ marginTop: "2rem", fontSize: 13 }}>
        <a href="/">← Back to your sites</a>
      </p>
    </div>
  );
}
