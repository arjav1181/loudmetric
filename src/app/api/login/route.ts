import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getPool } from "@/lib/db";
import { verifyPassword, createSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const email = String(form?.get("email") ?? "").toLowerCase().trim();
  const password = String(form?.get("password") ?? "");

  const fail = NextResponse.redirect(new URL("/login?error=wrong", req.url), 303);

  if (!email || !password) return fail;

  const res = await getPool()
    .query<{ id: string; password_hash: string }>("SELECT id, password_hash FROM users WHERE email = $1", [email])
    .catch(() => null);

  const user = res?.rows[0];
  // Verify even when the user does not exist, against a dummy hash, so a missing
  // account and a wrong password take the same time. Otherwise response latency
  // enumerates your user table.
  const ok = user
    ? verifyPassword(password, user.password_hash)
    : verifyPassword(password, "00".repeat(16) + ":" + "00".repeat(64));

  if (!user || !ok) return fail;

  await createSessionCookie(user.id);
  return NextResponse.redirect(new URL("/dashboard", req.url), 303);
}
