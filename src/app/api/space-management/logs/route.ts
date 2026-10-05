import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbReadRetry } from "@/lib/db-retry";
import { DEFAULT_SPACE_ID, assertSpaceManager } from "@/lib/server-utils";
import { forbidden, internalError, unauthorized } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  if (!(await assertSpaceManager(session.user.id, DEFAULT_SPACE_ID))) return forbidden();
  try {
    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit")) || 60, 1), 100);
    const cursor = request.nextUrl.searchParams.get("cursor");
    const type = request.nextUrl.searchParams.get("type")?.trim() ?? "";
    const query = request.nextUrl.searchParams.get("query")?.trim() ?? "";
    const logs = await withDbReadRetry(() => prisma.activityLog.findMany({
      where: {
        spaceId: DEFAULT_SPACE_ID,
        ...(type ? { type } : {}),
        ...(query ? { OR: [{ title: { contains: query } }, { actor: { name: { contains: query } } }, { actor: { email: { contains: query } } }, { project: { name: { contains: query } } }] } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit + 1,
      select: { id: true, type: true, action: true, title: true, entityType: true, entityId: true, metadata: true, beforeData: true, afterData: true, createdAt: true, project: { select: { id: true, name: true } }, actor: { select: { id: true, name: true, email: true, role: true } } },
    }), { operation: "space-management:logs:list" });
    const hasMore = logs.length > limit;
    const items = logs.slice(0, limit).map((log) => ({ id: log.id, type: log.type, action: log.action, title: log.title ?? `${log.entityType} ${log.entityId}`, timestamp: log.createdAt.toISOString(), beforeData: log.beforeData, afterData: log.afterData, project: log.project ?? { id: "", name: "부서" }, actor: log.actor }));
    return NextResponse.json({ items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null });
  } catch (error) {
    console.error("[api/space-management/logs] GET failed", error);
    return internalError("활동 로그를 불러오지 못했습니다.");
  }
}
