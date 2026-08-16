import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { assertAdmin } from "@/lib/server-utils";
import { withDbRetry } from "@/lib/db-retry";

type Params = { params: Promise<{ cohortId: string }> };

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return false;
  return assertAdmin(session.user.id);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { cohortId } = await params;
  const body = await req.json();
  const data = {
    ...(typeof body.name === "string" && body.name.trim() ? { name: body.name.trim() } : {}),
    ...(typeof body.isActive === "boolean" ? { isActive: body.isActive } : {}),
    ...(Number.isInteger(body.order) ? { order: body.order } : {}),
  };
  if (!Object.keys(data).length) return NextResponse.json({ error: "변경할 값이 없습니다." }, { status: 400 });

  try {
    const cohort = await withDbRetry(() => prisma.cohort.update({ where: { id: cohortId }, data }), { operation: "admin:cohorts:update" });
    return NextResponse.json(cohort);
  } catch {
    return NextResponse.json({ error: "기수 수정에 실패했습니다." }, { status: 404 });
  }
}