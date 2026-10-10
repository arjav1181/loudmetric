"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

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

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}

/**
 * Preserves the active site across navigation.
 *
 * Without this, every click drops the site selection and you land on a
 * dashboard for a different site — the single most annoying failure mode in a
 * multi-site analytics tool.
 */
export function Nav({ vertical }: { vertical?: boolean }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const site = params.get("site");
  const range = params.get("range");

  const href = (target: string) => {
    const qs = new URLSearchParams();
    if (site) qs.set("site", site);
    if (range && range !== "30d") qs.set("range", range);
    const s = qs.toString();
    return s ? `${target}?${s}` : target;
  };

  const groups: { group: string; items: NavItem[] }[] = [];
  for (const item of NAV) {
    let g = groups.find((x) => x.group === item.group);
    if (!g) {
      g = { group: item.group, items: [] };
      groups.push(g);
    }
    g.items.push(item);
  }

  return (
    <nav className={vertical ? "flex-1" : "flex gap-1"}>
      {groups.map((g) => (
        <div key={g.group} className={vertical ? "mb-7 last:mb-0" : "contents"}>
          {vertical ? (
            <>
              <p className="text-[10px] font-medium tracking-[0.2em] text-white/40 uppercase">{g.group}</p>
              <ul className="mt-3 space-y-0.5">
                {g.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={href(item.href)}
                      className={`block rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                        isActive(pathname, item.href)
                          ? "bg-white/[0.07] text-white"
                          : "text-white/45 hover:bg-white/[0.04] hover:text-white/80"
                      }`}
                      aria-current={isActive(pathname, item.href) ? "page" : undefined}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <ul className="flex gap-1">
              {g.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={href(item.href)}
                    className="block whitespace-nowrap rounded-md px-2.5 py-1.5 font-mono text-[11px] transition-colors"
                    aria-current={isActive(pathname, item.href) ? "page" : undefined}
                    style={{
                      color: isActive(pathname, item.href) ? "#fff" : "rgba(255,255,255,.4)",
                      background: isActive(pathname, item.href) ? "rgba(255,255,255,.09)" : "transparent",
                    }}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </nav>
  );
}