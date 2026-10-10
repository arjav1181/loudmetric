"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RANGES, rangeHref } from "./ranges";
import type { Range } from "@/lib/queries";

/**
 * Page header shared by every dashboard view.
 *
 * Client because the range switcher is a Radix Select: keyboard navigation,
 * typeahead and focus management come from the primitive, and the popover is
 * restyled to Geist rather than shipped with Radix's default chrome. It was a
 * row of anchors until it needed a fifth range and started wrapping on narrow
 * screens, which is the usual moment a segmented control has stopped being the
 * right component.
 */
export function Header({
  siteId,
  siteName,
  range,
  title,
  sub,
  base = "",
}: {
  siteId: string;
  siteName: string;
  range: Range;
  title: string;
  sub?: string;
  /** Path under /dashboard that the range links point back to. */
  base?: string;
}) {
  const router = useRouter();

  return (
    <header className="border-b border-white/[0.09] px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="geist-label">{siteName}</p>
          <h1 className="mt-1 text-[22px] font-semibold leading-tight tracking-[-0.02em]">
            {title}
          </h1>
          {sub ? (
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-white/45">{sub}</p>
          ) : null}
        </div>
        <Select
          value={range}
          onValueChange={(v) => router.push(rangeHref(base, siteId, v as Range))}
        >
          <SelectTrigger className="w-[150px] shrink-0" aria-label="Time range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((r) => (
              <SelectItem key={r.key} value={r.key}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </header>
  );
}
