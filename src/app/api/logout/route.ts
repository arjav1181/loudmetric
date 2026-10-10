import { NextResponse } from "next/server";
import { redirectUrl } from "@/lib/origin";
import { clearSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await clearSessionCookie();
  return NextResponse.redirect(new URL(redirectUrl(req, "/login")), 303);
}
