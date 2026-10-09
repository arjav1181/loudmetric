import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, createSessionCookie } from "@/lib/auth";
import { getPool } from "@/lib/db";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

/**
 * Sign in, and first-run setup in the same place.
 *
 * There is no separate signup flow. On a fresh install the users table is empty,
 * so this page *becomes* the create-account page; once an account exists it
 * reverts to a plain login form. One less screen to get wrong, and it means the
 * person setting LoudMetric up cannot accidentally configure a second operator
 * by clicking "sign up" later.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; setup?: string }>;
}) {
  const sp = await searchParams;

  if (await getCurrentUser()) redirect("/dashboard");

  let needsSetup = false;
  try {
    const res = await getPool().query("SELECT 1 FROM users LIMIT 1");
    needsSetup = res.rowCount === 0;
  } catch {
    // No database means nothing can be set up; say so rather than looping.
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-[15px] text-red-300/90">Database unavailable</p>
        <p className="max-w-sm text-[13px] leading-relaxed text-white/35">
          LoudMetric cannot reach Postgres, so it cannot check whether an account exists. Start the
          database and apply <code className="text-white/50">db/schema.sql</code>, then reload.
        </p>
      </div>
    );
  }

  if (needsSetup) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <p className="text-[10px] font-medium tracking-[0.18em] text-white/40 uppercase">
            First run
          </p>
          <h1 className="mt-2 text-[24px] font-bold tracking-tight">Create your account</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-white/45">
            This happens once. LoudMetric has no signup flow and no password reset — you are running
            it, and this account is the only one that will ever be created.
          </p>
          <form action="/api/setup" method="post" className="mt-6 space-y-3">
            <div>
              <label htmlFor="email" className="block text-[10px] tracking-[0.18em] text-white/40 uppercase">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="username"
                className="mt-1.5 w-full rounded-md border border-white/[0.12] bg-black/40 px-3 py-2.5 text-[13px] outline-none focus:border-white/35"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-[10px] tracking-[0.18em] text-white/40 uppercase">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={12}
                autoComplete="new-password"
                className="mt-1.5 w-full rounded-md border border-white/[0.12] bg-black/40 px-3 py-2.5 text-[13px] outline-none focus:border-white/35"
              />
              <p className="mt-1.5 text-[11px] text-white/25">At least 12 characters.</p>
            </div>
            <button
              type="submit"
              className="w-full rounded-md border border-white/20 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors hover:border-white/45"
            >
              Create account
            </button>
            {sp.error ? <p className="text-[12px] text-red-300/90">{sp.error}</p> : null}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="text-[15px] font-bold tracking-tight">LoudMetric</Link>
        <h1 className="mt-6 text-[20px] font-bold tracking-tight">Sign in</h1>
        <LoginForm />
        {sp.error ? <p className="mt-3 text-[12px] text-red-300/90">{sp.error}</p> : null}
      </div>
    </div>
  );
}
