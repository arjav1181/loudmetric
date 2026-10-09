"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";

export const LABEL = "text-[10px] font-medium tracking-[0.18em] uppercase text-white/40";

type NavItem = { href: string; label: string; group: string };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", group: "Metrics" },
  { href: "/dashboard/pages", label: "Pages", group: "Metrics" },
  { href: "/dashboard/engagement", label: "Engagement", group: "Metrics" },
  { href: "/dashboard/vitals", label: "Core Web Vitals", group: "Metrics" },
  { href: "/dashboard/copilot", label: "Copilot", group: "Ask" },
  { href: "/dashboard/funnels", label: "Funnels", group: "Measure" },
  { href: "/dashboard/events", label: "Events", group: "Measure" },
  { href: "/dashboard/settings", label: "Settings", group: "Measure" },
];

/**
 * Preserves the active site across navigation.
 *
 * Without this, every click drops the site selection and you land on a
 * dashboard for a different site — the single most annoying failure mode in a
 * multi-site analytics tool.
 */
export function useSiteHref(href: string): string {
  const params = useSearchParams();
  const site = params.get("site");
  const range = params.get("range");
  const qs = new URLSearchParams();
  if (site) qs.set("site", site);
  if (range && range !== "30d") qs.set("range", range);
  const s = qs.toString();
  return s ? `${href}?${s}` : href;
}

export function Nav({ vertical }: { vertical?: boolean }) {
  const pathname = usePathname();
  const groups = useMemo(() => {
    const out: { group: string; items: NavItem[] }[] = [];
    for (const item of NAV) {
      let g = out.find((x) => x.group === item.group);
      if (!g) {
        g = { group: item.group, items: [] };
        out.push(g);
      }
      g.items.push(item);
    }
    return out;
  }, []);

  return (
    <nav className={vertical ? "flex-1" : "flex gap-1"}>
      {groups.map((g) => (
        <div key={g.group} className={vertical ? "mb-7 last:mb-0" : "contents"}>
          {vertical ? (
            <>
              <p className={LABEL}>{g.group}</p>
              <ul className="mt-3 space-y-0.5">
                {g.items.map((item) => (
                  <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
                ))}
              </ul>
            </>
          ) : (
            <ul className="flex gap-1">
              {g.items.map((item) => (
                <li key={item.href}>
                  <NavLink
                    item={item}
                    active={isActive(pathname, item.href)}
                    compact
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </nav>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}

function NavLink({ item, active, compact }: { item: NavItem; active: boolean; compact?: boolean }) {
  const href = useSiteHref(item.href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`block rounded-md transition-colors ${
        compact
          ? `px-2.5 py-1.5 font-mono text-[11px] ${
              active ? "bg-white/[0.09] text-white" : "text-white/40 hover:text-white/70"
            }`
          : `px-2.5 py-1.5 text-[13px] ${
              active ? "bg-white/[0.07] text-white" : "text-white/45 hover:bg-white/[0.04] hover:text-white/80"
            }`
      }`}
    >
      {item.label}
    </Link>
  );
}
