import { detectAnomalies, type Anomaly } from "@/lib/anomaly";
import { Panel } from "./ui";

/**
 * Anomaly panel.
 *
 * Deliberately placed above the traffic chart. A tool that makes you scroll to
 * find something wrong has already lost the job it was built to do, and the
 * entire value of running detection on a schedule is that it does not depend on
 * anyone remembering to ask.
 *
 * Everything here is plain arithmetic — a median and a median absolute deviation
 * against the same weekday. No model, no API key, no waiting. It works with the
 * AI layer switched off, which is the point: the most reliable feature in the
 * product is the one that cannot hallucinate.
 */
export async function AnomalyPanel({ siteId }: { siteId: string }) {
  const report = await detectAnomalies(siteId, 28);

  return (
    <Panel
      title="Anomalies"
      hint="Each day against the same weekday over the previous 8 weeks. Median and median absolute deviation, so one viral day does not hide the next one."
      action={<span className="font-mono text-[10px] text-white/20">automatic</span>}
    >
      <Body report={report} />
    </Panel>
  );
}

const TONE: Record<Anomaly["severity"], string> = {
  high: "border-red-400/25 bg-red-400/[0.04]",
  medium: "border-amber-400/20 bg-amber-400/[0.03]",
  low: "border-white/[0.08] bg-white/[0.02]",
};

const DOT: Record<Anomaly["severity"], string> = {
  high: "bg-red-400",
  medium: "bg-amber-400",
  low: "bg-white/30",
};

function Body({ report }: { report: Awaited<ReturnType<typeof detectAnomalies>> }) {
  if (report.thinData) {
    return (
      <p className="py-6 text-center text-[12px] leading-relaxed text-white/30">
        Not enough traffic yet to know what normal looks like. Detection needs roughly 500 events and
        four weeks of history before a deviation means anything.
      </p>
    );
  }

  if (report.findings.length === 0) {
    return (
      <p className="py-6 text-center text-[12px] text-white/25">
        Nothing unusual. Every day in the last {report.days} sat inside its baseline.
      </p>
    );
  }

  return (
    <ul className="space-y-2.5">
      {report.findings.map((f) => (
        <li key={f.metric} className={`rounded-md border p-3 ${TONE[f.severity]}`}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 rounded-full ${DOT[f.severity]}`} />
              <span className="font-mono text-[12px] text-white/80">{f.label}</span>
            </span>
            <span
              className={`font-mono text-[12px] tabular-nums ${
                f.direction === "drop" ? "text-red-300/80" : "text-emerald-300/80"
              }`}
            >
              {f.changePct > 0 ? "+" : ""}
              {f.changePct}%
            </span>
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-white/50">{f.hint}</p>
          <p className="mt-1.5 font-mono text-[10px] text-white/25">
            {f.at} · {f.actual} vs a baseline of {f.expected} across {f.samples} matching days
          </p>
        </li>
      ))}
    </ul>
  );
}