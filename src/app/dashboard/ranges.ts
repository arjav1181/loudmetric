import type { Range } from "@/lib/queries";

export const RANGES: { key: Range; label: string }[] = [
  { key: "24h", label: "Last 24 hours" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
];

export function rangeHref(base: string, siteId: string, range: Range): string {
  return `/dashboard${base}?site=${siteId}&range=${range}`;
}

export function parseRange(v: string | undefined): Range {
  return v === "24h" || v === "7d" || v === "90d" ? v : "30d";
}
