import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbReadRetry, withDbWrite } from "@/lib/db-retry";
import { DEFAULT_SPACE_ID, assertSpaceManager } from "@/lib/server-utils";
import { readJsonObject } from "@/lib/validation";
import { forbidden, internalError, notFound, unauthorized, validationError } from "@/lib/api-error";

function getUserId() {
  return auth().then((session) => session?.user?.id ?? null);
}

async function requireManager() {
  const userId = await getUserId();
  if (!userId) return { response: unauthorized() };
  if (!(await assertSpaceManager(userId, DEFAULT_SPACE_ID))) return { response: forbidden() };
  return { userId };
}

export async function GET(request: NextRequest) {
  const access = await requireManager();
  if ("response" in access) return access.response;

  try {
    const query = request.nextUrl.searchParams.get("query")?.trim() ?? "";
    const members = await withDbReadRetry(
      () => prisma.spaceMember.findMany({
        where: {
          spaceId: DEFAULT_SPACE_ID,
          ...(query ? { user: { OR: [{ name: { contains: query } }, { email: { contains: query } }] } } : {}),
        },
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
        take: 100,
        select: {
          id: true,
          role: true,
          joinedAt: true,
          user: { select: { id: true, name: true, email: true, role: true, cohort: { select: { id: true, name: true } }, projects: { where: { project: { spaceId: DEFAULT_SPACE_ID } }, select: { role: true, project: { select: { id: true, name: true } } } } } },
        },
      }),
      { operation: "space-management:members:list" },
    );
    return NextResponse.json({ items: members });
  } catch (error) {
    console.error("[api/space-management/members] GET failed", error);
    return internalError("Space 구성원 목록을 불러오지 못했습니다.");
  }
}

export async function PATCH(request: NextRequest) {
  const access = await requireManager();
  if ("response" in access) return access.response;

  try {
    const data = await readJsonObject(request);
    const userId = typeof data.userId === "string" ? data.userId.trim() : "";
    const role = data.role === "space_manager" ? "space_manager" : data.role === "member" ? "member" : "";
    if (!userId || !role) return validationError("대상 구성원과 올바른 역할이 필요합니다.");
    if (userId === access.userId && role !== "space_manager") return validationError("현재 계정의 관리자 권한은 스스로 회수할 수 없습니다.");

    const member = await withDbWrite(() => prisma.spaceMember.update({
      where: { spaceId_userId: { spaceId: DEFAULT_SPACE_ID, userId } },
      data: { role },
      select: { id: true, role: true, joinedAt: true, user: { select: { id: true, name: true, email: true, role: true, cohort: { select: { id: true, name: true } }, projects: { where: { project: { spaceId: DEFAULT_SPACE_ID } }, select: { role: true, project: { select: { id: true, name: true } } } } } } },
    }));
    return NextResponse.json(member);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Record to update not found")) return notFound("Space 구성원을 찾을 수 없습니다.");
    console.error("[api/space-management/members] PATCH failed", error);
    return internalError("구성원 역할 변경에 실패했습니다.");
  }
}

export async function DELETE(request: NextRequest) {
  const access = await requireManager();
  if ("response" in access) return access.response;

  try {
    const data = await readJsonObject(request);
    const userId = typeof data.userId === "string" ? data.userId.trim() : "";
    if (!userId) return validationError("제거할 구성원이 필요합니다.");
    if (userId === access.userId) return validationError("현재 계정은 직접 제거할 수 없습니다.");

    const space = await prisma.space.findUnique({ where: { id: DEFAULT_SPACE_ID }, select: { adminUserId: true } });
    if (space?.adminUserId === userId) return validationError("현재 Space 관리자는 제거할 수 없습니다.");
    await withDbWrite(() => prisma.spaceMember.delete({ where: { spaceId_userId: { spaceId: DEFAULT_SPACE_ID, userId } } }));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Record to delete does not exist")) return notFound("Space 구성원을 찾을 수 없습니다.");
    console.error("[api/space-management/members] DELETE failed", error);
    return internalError("구성원 제거에 실패했습니다.");
  }
}
