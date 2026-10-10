import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

/**
 * Dashboard authentication.
 *
 * Self-hosted, so the usual SaaS machinery is deliberately absent: no password
 * reset email, no OAuth provider, no signup. One operator, one password, set
 * once at install.
 *
 * Two choices worth defending:
 *
 * scrypt from node:crypto rather than bcrypt/argon2 as a dependency. It is a
 * memory-hard KDF in the standard library, the dependency graph for a
 * self-hosted tool should not include a native crypto module that has to be
 * compiled on whatever machine the operator has, and "npm install fails because
 * node-gyp needed a build toolchain" is a bad first-run experience for a
 * project whose pitch is one command.
 *
 * A signed cookie rather than a session table. The session is an HMAC over an
 * expiry and the user id, verified in constant time. There is nothing to revoke
 * server-side, which is a genuine limitation — noted in the README — and in
 * exchange there is no session store to run, clean up, or forget to expire.
 */

const COOKIE = "lm_session";
const MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

export type User = { id: string; email: string };

/**
 * Validate configuration without throwing.
 *
 * Used to fail a request BEFORE it writes anything. An earlier version created
 * the operator row and only then hit the weak-secret guard when signing the
 * session, leaving an account that exists, has no session, and cannot be
 * re-created because bootstrap correctly refuses to run twice. Configuration
 * checks belong at the top of the request, not at the bottom.
 */
export function assertAuthConfigured(): void {
  secret();
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    // Refusing to fall back to a default is the whole point. A weak secret makes
    // every cookie forgeable, and a forgeable session on an endpoint that can
    // run SQL is a total compromise.
    throw new Error(
      "SESSION_SECRET must be set to at least 16 characters. Generate one with: openssl rand -hex 32",
    );
  }
  return s;
}

/** scrypt hash, stored as `salt:hash` in hex. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
    // Constant-time: a length or early-exit difference would leak the hash.
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(userId: string): string {
  const exp = String(Date.now() + MAX_AGE_S * 1000);
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined): User | null {
  if (!token) return null;
  const lastDot = token.lastIndexOf(".");
  if (lastDot < 0) return null;
  const payload = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  const expected = sign(payload);
  // Compare before parsing, so a forged token never reaches the date parser.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const dot = payload.indexOf(".");
  if (dot < 0) return null;
  const userId = payload.slice(0, dot);
  const exp = Number(payload.slice(dot + 1));
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  return { id: userId, email: "" };
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const jar = await cookies();
    const tok = readSessionToken(jar.get(COOKIE)?.value);
    if (!tok) return null;
    const res = await getPool().query<User>("SELECT id, email FROM users WHERE id = $1", [tok.id]);
    return res.rows[0] ?? null;
  } catch {
    return null;
  }
}

/** Sessions this user may read. Empty array means no sites at all. */
export async function allowedSiteIds(userId: string): Promise<string[]> {
  const res = await getPool().query<{ site_id: string }>(
    "SELECT site_id FROM user_sites WHERE user_id = $1",
    [userId],
  );
  return res.rows.map((r) => r.site_id);
}

export async function createSessionCookie(userId: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/**
 * First-run bootstrap: creates the single operator account if the users table is
 * empty. Refuses to run again once an account exists, so an open instance on the
 * internet cannot be claimed by whoever arrives second.
 */
export async function ensureBootstrapUser(
  email: string,
  password: string,
): Promise<{ created: boolean; error?: string }> {
  if (!email || !password) return { created: false, error: "email and password are required" };
  if (password.length < 12) {
    return { created: false, error: "password must be at least 12 characters" };
  }
  const pool = getPool();
  const existing = await pool.query("SELECT 1 FROM users LIMIT 1");
  if (existing.rowCount && existing.rowCount > 0) {
    return { created: false, error: "an account already exists" };
  }
  const res = await pool.query<{ id: string }>(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
    [email.toLowerCase().trim(), hashPassword(password)],
  );
  // The single operator gets every existing site. Otherwise a first-run install
  // with a site already in the database would show an empty dashboard forever.
  await pool.query(
    `INSERT INTO user_sites (user_id, site_id)
     SELECT $1, id FROM sites ON CONFLICT DO NOTHING`,
    [res.rows[0].id],
  );
  return { created: true };
}
/**
 * Require a signed-in operator.
 *
 * Redirects rather than throwing, so every page under the dashboard is covered
 * by one call in the layout instead of a check in each of eight files. Missing
 * one is not a subtle bug, it is an open dashboard.
 *
 * The redirect carries the original path so the login form can send you back to
 * where you were going rather than dumping you on the overview.
 */
export async function requireUser(returnTo?: string): Promise<User> {
  const user = await getCurrentUser();
  if (user) return user;
  const target = returnTo ? `?next=${encodeURIComponent(returnTo)}` : "";
  redirect(`/login${target}`);
}

/**
 * Same check for a route handler.
 *
 * Returns a NextResponse instead of redirecting, because a fetch() following a
 * 303 into an HTML login page produces a confusing parse error rather than a
 * clear 401.
 */
export async function requireUserApi(): Promise<User | NextResponse> {
  const user = await getCurrentUser();
  if (user) return user;
  return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
}

/** True when the returned value is the error response rather than the user. */
export function isAuthError(v: User | NextResponse): v is NextResponse {
  return v instanceof NextResponse;
}

/**
 * Authorise a site id for this user.
 *
 * Separate from requireUser because knowing who someone are is not the same as
 * being allowed to read a given site — the moment there is more than one
 * operator, every endpoint taking a siteId from the browser has to check it.
 */
export async function requireSiteAccess(
  userId: string,
  siteId: string | null | undefined,
): Promise<boolean> {
  if (!siteId) return false;
  const allowed = await allowedSiteIds(userId);
  return allowed.includes(siteId);
}
