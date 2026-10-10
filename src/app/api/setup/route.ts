import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { ensureBootstrapUser, createSessionCookie, assertAuthConfigured } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * First-run account creation.
 *
 * Refuses if any account already exists — see ensureBootstrapUser. The refusal is
 * re-checked here rather than trusted from the page that rendered the form,
 * because that page is a static HTML form anyone can POST to directly.
 */
export async function POST(req: Request) {
  // Before anything is written. A misconfigured instance must not be able to
  // consume its own one-shot bootstrap.
  try {
    assertAuthConfigured();
  } catch {
    return NextResponse.redirect(
      new URL("/login?error=Server%20is%20misconfigured", req.url),
      303,
    );
  }

  const form = await req.formData().catch(() => null);
  const email = String(form?.get("email") ?? "");
  const password = String(form?.get("password") ?? "");

  const fail = (msg: string) =>
    NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, req.url), 303);

  const result = await ensureBootstrapUser(email, password);
  if (!result.created) return fail(result.error ?? "could not create account");

  const user = await getPool()
    .query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email.toLowerCase().trim()])
    .then((r) => r.rows[0])
    .catch(() => null);

  if (!user) return fail("account created but could not be loaded");
  await createSessionCookie(user.id);
  return NextResponse.redirect(new URL("/dashboard", req.url), 303);
}
