import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { createGoal, deleteGoal, listGoals, goalProperties } from "@/lib/goals";
import { getCurrentUser, allowedSiteIds } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Goal declaration.
 *
 * Site authorisation is re-checked here rather than trusted from the page that
 * rendered the form, because that page is a form anyone can POST to directly.
 * The same check the copilot uses.
 */
export async function POST(req: Request) {
  let body: {
    siteId?: string;
    name?: string;
    unit?: string;
    description?: string;
    properties?: { key: string; type?: "number" | "string"; agg?: "sum" | "avg" | "count"; unit?: string }[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!body.siteId) return NextResponse.json({ error: "siteId is required" }, { status: 400 });

  // Both checks: a valid session, AND this operator may touch this site.
  const allowed = await allowedSiteIds(user.id);
  if (!allowed.includes(body.siteId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await createGoal(body.siteId, {
    name: body.name ?? "",
    unit: body.unit,
    description: body.description,
    properties: Array.isArray(body.properties) ? body.properties : [],
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ goal: result.goal }, { status: 201 });
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const siteId = new URL(req.url).searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "siteId is required" }, { status: 400 });
  const allowed = await allowedSiteIds(user.id);
  if (!allowed.includes(siteId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const goals = await listGoals(siteId);
  const props = await goalProperties(goals.map((g) => g.id));
  return NextResponse.json({
    goals: goals.map((g) => ({ ...g, properties: props.filter((p) => p.goal_id === g.id) })),
  });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const siteId = url.searchParams.get("siteId");
  const goalId = url.searchParams.get("id");
  if (!siteId || !goalId) {
    return NextResponse.json({ error: "siteId and id are required" }, { status: 400 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const allowed = await allowedSiteIds(user.id);
  if (!allowed.includes(siteId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // Cascades to goal_properties. Events are deliberately left alone: deleting a
  // goal removes the declaration, not the history it produced.
  const ok = await deleteGoal(siteId, goalId);
  return NextResponse.json({ deleted: ok });
}
