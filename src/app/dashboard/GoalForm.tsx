"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Prop = { key: string; type: "number" | "string"; agg: "sum" | "avg" | "count"; unit: string };

/**
 * Goal declaration form.
 *
 * Exists because the alternative is hardcoding somebody else's business model
 * into the analytics tool. A Flappy Bird player tracks play_clicked and
 * played_seconds; a shop tracks add_to_cart and revenue_cents. Both get correct
 * sums, averages and distributions from the same dashboard, because the goal
 * carries its own definition.
 */
export function GoalForm({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [description, setDescription] = useState("");
  const [props, setProps] = useState<Prop[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const addProp = () =>
    setProps((p) => [...p, { key: "", type: "number", agg: "sum", unit: "" }]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteId,
          name,
          unit: unit || undefined,
          description: description || undefined,
          properties: props.filter((p) => p.key.trim()),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "Could not create the goal.");
        return;
      }
      setOk(`Goal "${data.goal.name}" created.`);
      setName("");
      setUnit("");
      setDescription("");
      setProps([]);
      router.refresh();
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="goal-name" className="geist-label">
            Event name
          </label>
          <input
            id="goal-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="play_clicked"
            className="geist-input mt-1.5"
            required
          />
          <p className="mt-1 text-[11px] text-white/35">
            Must match the name you pass to <code>track()</code>.
          </p>
        </div>
        <div>
          <label htmlFor="goal-unit" className="geist-label">
            Unit
          </label>
          <input
            id="goal-unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="seconds"
            className="geist-input mt-1.5"
          />
          <p className="mt-1 text-[11px] text-white/35">
            Shown next to the numbers so a bare count is never ambiguous.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="goal-desc" className="geist-label">
          Description
        </label>
        <input
          id="goal-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Someone pressed Play"
          className="geist-input mt-1.5"
        />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="geist-label">Properties</span>
          <button type="button" onClick={addProp} className="geist-btn geist-btn-tertiary h-7 px-2 text-[12px]">
            Add property
          </button>
        </div>
        {props.length === 0 ? (
          <p className="mt-1.5 text-[12px] text-white/35">
            None yet. A goal with no properties still counts events and sessions.
          </p>
        ) : null}
        <div className="mt-2 space-y-2">
          {props.map((p, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <input
                value={p.key}
                onChange={(e) =>
                  setProps((all) =>
                    all.map((x, j) => (i === j ? { ...x, key: e.target.value } : x)),
                  )
                }
                placeholder="played_seconds"
                className="geist-input"
                aria-label={`Property ${i + 1} name`}
              />
              <select
                value={p.agg}
                onChange={(e) =>
                  setProps((all) =>
                    all.map((x, j) =>
                      i === j ? { ...x, agg: e.target.value as Prop["agg"] } : x,
                    ),
                  )
                }
                className="geist-input"
                aria-label={`Property ${i + 1} aggregation`}
              >
                <option value="sum">Sum</option>
                <option value="avg">Average</option>
                <option value="count">Count</option>
              </select>
              <input
                value={p.unit}
                onChange={(e) =>
                  setProps((all) =>
                    all.map((x, j) => (i === j ? { ...x, unit: e.target.value } : x)),
                  )
                }
                placeholder="s"
                className="geist-input"
                aria-label={`Property ${i + 1} unit`}
              />
              <button
                type="button"
                onClick={() => setProps((all) => all.filter((_, j) => j !== i))}
                className="geist-btn geist-btn-tertiary"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="geist-btn geist-btn-primary" disabled={busy || !name.trim()}>
          {busy ? "Creating…" : "Create Goal"}
        </button>
        {err ? <span className="text-[12px] text-red-300">{err}</span> : null}
        {ok ? <span className="text-[12px] text-emerald-300">{ok}</span> : null}
      </div>
    </form>
  );
}
