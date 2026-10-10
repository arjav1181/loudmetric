/**
 * Chart colour tokens, shared by every Recharts surface.
 *
 * Centralised so a chart cannot drift: the grid, axis and mark colours are
 * defined once and every chart imports them. Recharts' own defaults are
 * overridden everywhere — its default grid is a visible grey and its default
 * tooltip is a white card, both of which would announce a different design
 * system.
 */
export const GRID = "rgba(255,255,255,0.06)";
export const AXIS = "rgba(255,255,255,0.12)";
export const MARK = "rgba(255,255,255,0.30)";
export const MARK_STRONG = "rgba(255,255,255,0.70)";
export const LABEL = "geist-label";
