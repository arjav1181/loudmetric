"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type Item = { href: string; label: string; group: string };

/**
 * Geist app shell: a persistent top bar plus a fixed-width rail.
 *
 * The proportions follow Geist rather than the previous hand-rolled layout — a
 * 64px top bar, a 240px rail, 6px radii, and borders on gray-alpha tokens. The
 * rail never disappears on mobile; it becomes a horizontally scrollable strip,
 * because a nav that hides below a breakpoint is a nav people cannot find.
 */

export const NAV: Item[] = [
  { href: "/dashboard", label: "Overview", group: "Analytics" },
  { href: "/dashboard/pages", label: "Pages", group: "Analytics" },
  { href: "/dashboard/engagement", label: "Engagement", group: "Analytics" },
  { href: "/dashboard/vitals", label: "Core Web Vitals", group: "Analytics" },
  { href: "/dashboard/copilot", label: "Copilot", group: "Ask" },
  { href: "/dashboard/funnels", label: "Funnels", group: "Measure" },
  { href: "/dashboard/events", label: "Events", group: "Measure" },
  { href: "/dashboard/settings", label: "Settings", group: "Measure" },
];

function Glyph({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

const ICONS: Record<string, string> = {
  Overview: "M2 13V3M2 13h12M5 10.5l3-4 3 2 2.5-4",
  Pages: "M4 2h5l3 3v9H4zM9 2v3h3M6 8h4M6 10.5h4",
  Engagement: "M3 2l4.5 11 1.8-4.2L13.5 7 3 2z",
  "Core Web Vitals": "M8 2a6 6 0 104.2 10.2M8 5v3l2 1.5",
  Copilot: "M8 1.5l1.6 4.4 4.4 1.6-4.4 1.6L8 13.5 6.4 9.1 2 7.5l4.4-1.6z",
  Funnels: "M2 3h12l-4.5 5v5l-3 1.5V8z",
  Events: "M5 10.5l3-4 3 2 2.5-4M2 13V3M2 13h12",
  Settings: "M10.5 2.5a3.5 3.5 0 00-4.6 4.7L2 11l1.5 1.5 3.9-3.9a3.5 3.5 0 004.7-4.6L10 6.2 7.8 4",
};

export function Nav({ horizontal }: { horizontal?: boolean }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const site = params.get("site");
  const range = params.get("range");

  // The site selection survives navigation. Losing it on every click is the most
  // annoying failure mode in a multi-site analytics tool.
  const href = (target: string) => {
    const qs = new URLSearchParams();
    if (site) qs.set("site", site);
    if (range && range !== "30d") qs.set("range", range);
    const s = qs.toString();
    return s ? `${target}?${s}` : target;
  };

  const active = (h: string) =>
    h === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(h);

  if (horizontal) {
    return (
      <nav className="flex items-center gap-1 overflow-x-auto" aria-label="Dashboard sections">
        {NAV.map((i) => (
          <Link
            key={i.href}
            href={href(i.href)}
            aria-current={active(i.href) ? "page" : undefined}
            className={`whitespace-nowrap rounded px-2.5 py-1.5 text-[13px] transition-colors ${
              active(i.href)
                ? "bg-white/[0.09] text-white"
                : "text-white/55 hover:bg-white/[0.06] hover:text-white"
            }`}
          >
            {i.label}
          </Link>
        ))}
      </nav>
    );
  }

  const groups: { group: string; items: Item[] }[] = [];
  for (const item of NAV) {
    let g = groups.find((x) => x.group === item.group);
    if (!g) {
      g = { group: item.group, items: [] };
      groups.push(g);
    }
    g.items.push(item);
  }

  return (
    <nav aria-label="Dashboard sections">
      {groups.map((g) => (
        <div key={g.group} className="mb-6 last:mb-0">
          <p className="px-3 pb-2 text-[12px] font-medium text-white/40">{g.group}</p>
          <ul>
            {g.items.map((i) => (
              <li key={i.href}>
                <Link
                  href={href(i.href)}
                  aria-current={active(i.href) ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded px-3 py-2 text-[13px] transition-colors ${
                    active(i.href)
                      ? "bg-white/[0.09] text-white"
                      : "text-white/55 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  <Glyph d={ICONS[i.label] ?? ICONS.Overview} />
                  {i.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
