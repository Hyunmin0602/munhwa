import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { assertAdmin } from "@/lib/server-utils";
import { withDbRetry } from "@/lib/db-retry";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!(await assertAdmin(session.user.id))) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { userId: session.user.id };
}

export async function GET() {
  const access = await requireAdmin();
  if ("response" in access) return access.response;

  const cohorts = await withDbRetry(
    () => prisma.cohort.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }], include: { _count: { select: { users: true } } } }),
    { operation: "admin:cohorts:list" }
  );
  return NextResponse.json(cohorts);
}

export async function POST(req: NextRequest) {
  const access = await requireAdmin();
  if ("response" in access) return access.response;

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "기수 이름이 필요합니다." }, { status: 400 });

  try {
    const cohort = await withDbRetry(
      () => prisma.cohort.create({ data: { name, order: Number.isInteger(body.order) ? body.order : 0 } }),
      { operation: "admin:cohorts:create" }
    );
    return NextResponse.json(cohort, { status: 201 });
  } catch {
    return NextResponse.json({ error: "기수 생성에 실패했습니다." }, { status: 409 });
  }
}