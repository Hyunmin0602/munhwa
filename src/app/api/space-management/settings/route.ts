import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbReadRetry, withDbWrite } from "@/lib/db-retry";
import { DEFAULT_SPACE_ID, assertSpaceManager } from "@/lib/server-utils";
import { forbidden, internalError, unauthorized, validationError } from "@/lib/api-error";

async function requireManager() {
  const session = await auth();
  if (!session?.user?.id) return { response: unauthorized() };
  if (!(await assertSpaceManager(session.user.id, DEFAULT_SPACE_ID))) return { response: forbidden() };
  return { userId: session.user.id };
}

export async function GET() {
  const access = await requireManager();
  if ("response" in access) return access.response;
  try {
    const [space, cohorts] = await withDbReadRetry(() => Promise.all([
      prisma.space.findUnique({ where: { id: DEFAULT_SPACE_ID }, select: { id: true, name: true, slug: true } }),
      prisma.cohort.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }], include: { _count: { select: { users: true } } } }),
    ]), { operation: "space-management:settings:get" });
    return NextResponse.json({ space, cohorts });
  } catch (error) {
    console.error("[api/space-management/settings] GET failed", error);
    return internalError("부서 설정을 불러오지 못했습니다.");
  }
}

export async function PATCH(request: NextRequest) {
  const access = await requireManager();
  if ("response" in access) return access.response;
  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 100) return validationError("부서 이름을 올바르게 입력해주세요.");
    const space = await withDbWrite(() => prisma.space.update({ where: { id: DEFAULT_SPACE_ID }, data: { name }, select: { id: true, name: true, slug: true } }));
    return NextResponse.json(space);
  } catch (error) {
    console.error("[api/space-management/settings] PATCH failed", error);
    return internalError("부서 이름을 저장하지 못했습니다.");
  }
}

export async function POST(request: NextRequest) {
  const access = await requireManager();
  if ("response" in access) return access.response;
  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 100) return validationError("기수 이름을 올바르게 입력해주세요.");
    const cohort = await withDbWrite(() => prisma.cohort.create({ data: { name, order: Number.isInteger(body.order) ? body.order : 0 }, include: { _count: { select: { users: true } } } }));
    return NextResponse.json(cohort, { status: 201 });
  } catch (error) {
    console.error("[api/space-management/settings] POST failed", error);
    return NextResponse.json({ error: "기수 생성에 실패했습니다." }, { status: 409 });
  }
}
