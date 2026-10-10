import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Class merge helper used by the shadcn primitives.
 *
 * shadcn is here for behaviour and accessibility — focus management, ARIA,
 * keyboard handling — not for its visual defaults. Every component built on it
 * restyles back to Geist tokens, so a dependency upgrade cannot quietly restyle
 * the product.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
