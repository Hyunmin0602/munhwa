import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbReadRetry } from "@/lib/db-retry";
import { DEFAULT_SPACE_ID, assertSpaceManager } from "@/lib/server-utils";
import { forbidden, internalError, unauthorized, validationError } from "@/lib/api-error";
import { activityLogCursor, activityLogQuery } from "@/lib/activity-log-query";
import { InputValidationError } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  if (!(await assertSpaceManager(session.user.id, DEFAULT_SPACE_ID))) return forbidden();
  try {
    const { where, limit, order } = activityLogQuery(request.nextUrl.searchParams, DEFAULT_SPACE_ID);
    const logs = await withDbReadRetry(() => prisma.activityLog.findMany({
      where,
      orderBy: [{ createdAt: order }, { id: order }],
      take: limit + 1,
      select: { id: true, type: true, action: true, title: true, entityType: true, entityId: true, createdAt: true, project: { select: { id: true, name: true } }, actor: { select: { id: true, name: true, email: true } } },
    }), { operation: "space-management:logs:list" });
    const hasMore = logs.length > limit;
    const page = logs.slice(0, limit);
    const items = page.map((log) => ({ id: log.id, type: log.type, action: log.action, title: log.title ?? `${log.entityType} ${log.entityId}`, entityType: log.entityType, entityId: log.entityId, timestamp: log.createdAt.toISOString(), project: log.project, actor: log.actor }));
    const last = page.at(-1);
    return NextResponse.json({ items, nextCursor: hasMore && last ? activityLogCursor(last, order) : null });
  } catch (error) {
    if (error instanceof InputValidationError) return validationError(error.message);
    console.error("[api/space-management/logs] GET failed", error);
    return internalError("활동 로그를 불러오지 못했습니다.");
  }
}
