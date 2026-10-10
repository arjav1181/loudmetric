"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * A plain form that posts to the server and follows the redirect. No client-side
 * state machine: if the network is slow or JS is blocked, signing in should still
 * work, because it is the only way back into a self-hosted instance you forgot
 * the password to.
 */
export default function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <form
      action="/api/login"
      method="post"
      className="mt-5 space-y-3"
      onSubmit={() => setPending(true)}
    >
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
          className="geist-input mt-1.5"
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
          autoComplete="current-password"
          className="geist-input mt-1.5"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="geist-btn geist-btn-primary w-full"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
