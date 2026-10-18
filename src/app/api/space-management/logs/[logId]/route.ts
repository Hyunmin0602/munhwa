import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbReadRetry } from "@/lib/db-retry";
import { DEFAULT_SPACE_ID, assertSpaceManager } from "@/lib/server-utils";
import { forbidden, internalError, notFound, unauthorized } from "@/lib/api-error";

export async function GET(_: Request, { params }: { params: Promise<{ logId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  if (!(await assertSpaceManager(session.user.id, DEFAULT_SPACE_ID))) return forbidden();
  try {
    const { logId } = await params;
    const log = await withDbReadRetry(() => prisma.activityLog.findFirst({
      where: { id: logId, spaceId: DEFAULT_SPACE_ID },
      select: { id: true, entityType: true, entityId: true, metadata: true, beforeData: true, afterData: true },
    }), { operation: "space-management:logs:detail" });
    if (!log) return notFound("활동 로그를 찾을 수 없습니다.");
    return NextResponse.json(log);
  } catch (error) {
    console.error("[api/space-management/logs/:logId] GET failed", error);
    return internalError("로그 상세 내용을 불러오지 못했습니다.");
  }
}
