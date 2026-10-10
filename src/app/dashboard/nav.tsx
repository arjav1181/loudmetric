"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import type { LucideIcon } from "lucide-react";

type Item = { href: string; label: string; group: string };

/**
 * Geist app shell: a persistent top bar plus a fixed-width rail.
 *
 * The proportions follow Geist rather than the previous hand-rolled layout — a
 * 64px top bar, a 240px rail, 6px radii, and borders on gray-alpha tokens. The
 * rail never disappears on mobile; it becomes a horizontally scrollable strip,
 * because a nav that hides below a breakpoint is a nav people cannot find.
 */

/** Resolve the icon outside the list so the map does not run per render. */
function NavIcon({ label }: { label: string }) {
  const Icon = ICONS[label] ?? LayoutDashboard;
  return <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />;
}

export const NAV: Item[] = [
  { href: "/dashboard", label: "Overview", group: "Analytics" },
  { href: "/dashboard/pages", label: "Pages", group: "Analytics" },
  { href: "/dashboard/engagement", label: "Engagement", group: "Analytics" },
  { href: "/dashboard/vitals", label: "Core Web Vitals", group: "Analytics" },
  { href: "/dashboard/goals", label: "Goals", group: "Measure" },
  { href: "/dashboard/copilot", label: "Copilot", group: "Ask" },
  { href: "/dashboard/funnels", label: "Funnels", group: "Measure" },
  { href: "/dashboard/events", label: "Events", group: "Measure" },
  { href: "/dashboard/settings", label: "Settings", group: "Measure" },
];

import {
  LayoutDashboard,
  FileText,
  MousePointerClick,
  Gauge,
  Sparkles,
  Filter,
  Tag,
  Settings,
  Target,
} from "lucide-react";

/** lucide at 16px with a 1.5 stroke is the same icon language Geist uses. */
const ICONS: Record<string, LucideIcon> = {
  Overview: LayoutDashboard,
  Pages: FileText,
  Engagement: MousePointerClick,
  "Core Web Vitals": Gauge,
  Copilot: Sparkles,
  Funnels: Filter,
  Events: Tag,
  Settings,
  Goals: Target,
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
                  <NavIcon label={i.label} />
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
