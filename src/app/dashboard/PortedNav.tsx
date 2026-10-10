"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = {
  href: string;
  label: string;
  hint: string;
  icon: string;
};

export const NAV = [
  { hint: "", href: "/dashboard", label: "Overview", group: "Metrics", icon: "grid" },
  { hint: "", href: "/dashboard/pages", label: "Pages", group: "Metrics", icon: "doc" },
  { hint: "", href: "/dashboard/engagement", label: "Engagement", group: "Metrics", icon: "cursor" },
  { hint: "", href: "/dashboard/vitals", label: "Core Web Vitals", group: "Metrics", icon: "speed" },
  { hint: "", href: "/dashboard/copilot", label: "Copilot", group: "Ask", icon: "spark" },
  { hint: "", href: "/dashboard/funnels", label: "Funnels", group: "Measure", icon: "target" },
  { hint: "", href: "/dashboard/events", label: "Events", group: "Measure", icon: "chart" },
  { hint: "", href: "/dashboard/settings", label: "Settings", group: "Measure", icon: "wrench" },
];

function Icon({ name }: { name: string }) {
  const p = { strokeWidth: 1.5, stroke: "currentColor", fill: "none" } as const;
  switch (name) {
    case "grid":
      return (
        <svg viewBox="0 0 16 16" className="h-4 w-4" {...p}>
          <rect x="2" y="2" width="5" height="5" />
          <rect x="9" y="2" width="5" height="5" />
          <rect x="2" y="9" width="5" height="5" />
          <rect x="9" y="9" width="5" height="5" />
        </svg>
      );
    case "chart":
      return (
        <svg viewBox="0 0 16 16" className="h-4 w-4" {...p}>
          <path d="M2 13V3M2 13h12" />
          <path d="M5 10.5l3-4 3 2 2.5-4" />
        </svg>
      );
    case "cursor":
      return (
        <svg viewBox="0 0 16 16" className="h-4 w-4" {...p}>
          <path d="M3 2l4.5 11 1.8-4.2L13.5 7 3 2z" />
        </svg>
      );
    case "doc":
      return (
        <svg viewBox="0 0 16 16" className="h-4 w-4" {...p}>
          <path d="M4 2h5l3 3v9H4z" />
          <path d="M9 2v3h3M6 8h4M6 10.5h4" />
        </svg>
      );
    case "speed":
      return (
        <svg viewBox="0 0 16 16" className="h-4 w-4" {...p}>
          <path d="M8 2a6 6 0 104.2 10.2" />
          <path d="M8 5v3l2 1.5" />
        </svg>
      );
    case "target":
      return (
        <svg viewBox="0 0 16 16" className="h-4 w-4" {...p}>
          <circle cx="8" cy="8" r="5.5" />
          <circle cx="8" cy="8" r="2" />
        </svg>
      );
    case "spark":
      return (
        <svg viewBox="0 0 16 16" className="h-4 w-4" {...p}>
          <path d="M8 1.5l1.6 4.4 4.4 1.6-4.4 1.6L8 13.5 6.4 9.1 2 7.5l4.4-1.6z" />
        </svg>
      );
    case "inbox":
      return (
        <svg viewBox="0 0 16 16" className="h-4 w-4" {...p}>
          <path d="M2 9h3l1 2h4l1-2h3" />
          <path d="M2 9l2-6h8l2 6v4H2z" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 16 16" className="h-4 w-4" {...p}>
          <path d="M10.5 2.5a3.5 3.5 0 00-4.6 4.7L2 11l1.5 1.5 3.9-3.9a3.5 3.5 0 004.7-4.6L10 6.2 7.8 4" />
        </svg>
      );
  }
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Dashboard sections">
      {NAV.map((item) => {
        const active =
          item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`group flex items-center gap-2.5 border-l-2 px-3 py-2 transition-colors ${
              active
                ? "border-white/70 bg-white/[0.04] text-white"
                : "border-transparent text-white/45 hover:bg-white/[0.02] hover:text-white/75"
            }`}
          >
            <Icon name={item.icon ?? "grid"} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] leading-tight">{item.label}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}