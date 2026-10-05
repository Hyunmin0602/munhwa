import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbWrite } from "@/lib/db-retry";
import { DEFAULT_SPACE_ID, assertSpaceManager } from "@/lib/server-utils";
import { forbidden, internalError, notFound, unauthorized, validationError } from "@/lib/api-error";

type Params = { params: Promise<{ cohortId: string }> };

async function requireManager() {
  const session = await auth();
  if (!session?.user?.id) return { response: unauthorized() };
  if (!(await assertSpaceManager(session.user.id, DEFAULT_SPACE_ID))) return { response: forbidden() };
  return { userId: session.user.id };
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const access = await requireManager();
  if ("response" in access) return access.response;
  const { cohortId } = await params;
  try {
    const body = await request.json();
    const data = {
      ...(typeof body.name === "string" && body.name.trim() ? { name: body.name.trim() } : {}),
      ...(typeof body.isActive === "boolean" ? { isActive: body.isActive } : {}),
      ...(Number.isInteger(body.order) ? { order: body.order } : {}),
    };
    if (!Object.keys(data).length) return validationError("변경할 값이 없습니다.");
    const cohort = await withDbWrite(() => prisma.cohort.update({ where: { id: cohortId }, data, include: { _count: { select: { users: true } } } }));
    return NextResponse.json(cohort);
  } catch (error) {
    console.error("[api/space-management/settings/cohort] PATCH failed", error);
    if (error instanceof Error && error.message.includes("Record to update not found")) return notFound("기수를 찾을 수 없습니다.");
    return internalError("기수 설정을 저장하지 못했습니다.");
  }
}
