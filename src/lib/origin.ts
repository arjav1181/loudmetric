/**
 * Where redirects point.
 *
 * Building a redirect from `req.url` is wrong behind any proxy or in any
 * container, because req.url carries the *server's* idea of its own address.
 * On a Hugging Face Space that is 0.0.0.0:7860, so every login redirect sent
 * the browser to http://0.0.0.0:7860 — an address that means nothing outside
 * the container. It surfaced as "the login page is broken" when the real fault
 * was that the redirect target had no public hostname in it.
 *
 * Resolution order, most trustworthy first:
 *
 *   1. PUBLIC_ORIGIN, set explicitly. The only option that is right with no
 *      proxy headers at all, and the one a self-hosted operator should set.
 *   2. X-Forwarded-Proto/Host, which is how every reverse proxy in front of a
 *      Space tells the app its public address.
 *   3. The request URL, which is correct on a plain `next start` and wrong
 *      everywhere else.
 */
export function publicOrigin(req: Request): string | null {
  const explicit = process.env.PUBLIC_ORIGIN?.trim().replace(/\/$/, "");
  if (explicit) return explicit;

  const headers = req.headers;
  const host =
    headers.get("x-forwarded-host") ??
    headers.get("x-vercel-forwarded-host") ??
    headers.get("host");
  if (!host) return null;

  // A proxy forwards the real scheme. HF terminates TLS upstream of the
  // container, so the connection the app sees is plain http while the public URL
  // is https — trusting the connection here would downgrade every redirect.
  const proto =
    headers.get("x-forwarded-proto") ??
    (headers.get("x-forwarded-ssl") === "on" ? "https" : null) ??
    // A Host of 0.0.0.0 is the container admitting it does not know its own
    // public address. Defaulting to https is the safe reading: a wrong scheme
    // produces a browser warning, a wrong host produces a dead page.
    "https";

  return `${proto}://${host}`;
}

/**
 * Absolute redirect URL, falling back to a relative Location when the origin
 * cannot be determined. A relative Location is valid per RFC 7231 and still
 * reaches the right page, which beats redirecting somewhere unreachable.
 */
export function redirectUrl(req: Request, path: string): string {
  const origin = publicOrigin(req);
  // Falls back to a relative Location, which is valid per RFC 7231 and still
  // reaches the right page. Redirecting to an unreachable host is worse than
  // redirecting to a path.
  return origin ? `${origin}${path}` : path;
}
