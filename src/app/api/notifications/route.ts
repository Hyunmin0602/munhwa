import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { apiError, internalError, unauthorized } from "@/lib/api-error";
import { withDbReadRetry, withDbWrite } from "@/lib/db-retry";
import { prisma } from "@/lib/prisma";
import { InputValidationError, readJsonObject } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return unauthorized();
  const requestedLimit = request.nextUrl.searchParams.get("limit");
  const parsedLimit = requestedLimit === null ? 30 : Number(requestedLimit);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1) return apiError("VALIDATION_ERROR", "조회 개수가 올바르지 않습니다.", 400);
  const limit = Math.min(parsedLimit, 50);
  const unreadOnly = request.nextUrl.searchParams.get("unreadOnly") ?? "false";
  if (unreadOnly !== "true" && unreadOnly !== "false") return apiError("VALIDATION_ERROR", "알림 조회 조건이 올바르지 않습니다.", 400);
  const encodedCursor = request.nextUrl.searchParams.get("cursor");
  let cursor: { createdAt: Date; id: string } | null = null;
  if (encodedCursor) {
    try {
      if (encodedCursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(encodedCursor)) throw new Error("invalid cursor");
      const [timestamp, id] = Buffer.from(encodedCursor, "base64url").toString("utf8").split("|");
      const createdAt = new Date(timestamp);
      if (!id || Number.isNaN(createdAt.getTime())) throw new Error("invalid cursor");
      cursor = { createdAt, id };
    } catch {
      return apiError("VALIDATION_ERROR", "알림 페이지 값이 올바르지 않습니다.", 400);
    }
  }
  try {
    const [rows, unreadCount, preference] = await Promise.all([
      withDbReadRetry(() => prisma.notification.findMany({
        where: { recipientId: userId, ...(unreadOnly === "true" ? { readAt: null } : {}), ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1,
        select: { id: true, type: true, title: true, body: true, href: true, readAt: true, createdAt: true },
      })),
      withDbReadRetry(() => prisma.notification.count({ where: { recipientId: userId, readAt: null } })),
      withDbReadRetry(() => prisma.notificationPreference.findUnique({ where: { userId }, select: { mentionNotifications: true, assignmentNotifications: true, dueDateNotifications: true, meetingNotifications: true, approvalNotifications: true } })),
    ]);
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), readAt: row.readAt?.toISOString() ?? null }));
    const last = items.at(-1);
    const nextCursor = hasMore && last ? Buffer.from(`${last.createdAt}|${last.id}`).toString("base64url") : null;
    return NextResponse.json({ items, nextCursor, unreadCount, preferences: { mentionNotifications: preference?.mentionNotifications ?? true, assignmentNotifications: preference?.assignmentNotifications ?? true, dueDateNotifications: preference?.dueDateNotifications ?? true, meetingNotifications: preference?.meetingNotifications ?? true, approvalNotifications: preference?.approvalNotifications ?? true } });
  } catch {
    return internalError("알림을 불러오지 못했습니다.");
  }
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return unauthorized();
  try {
    const data = await readJsonObject(request);
    const markAllRead = data.markAllRead === true;
    if (markAllRead ? data.notificationId !== undefined : data.markAllRead !== undefined || typeof data.notificationId !== "string" || !data.notificationId.trim() || data.notificationId.length > 200) return apiError("VALIDATION_ERROR", "읽음 처리할 알림을 올바르게 지정해주세요.", 400);
    const notificationId = typeof data.notificationId === "string" ? data.notificationId.trim() : null;
    const readAt = new Date();
    const result = await withDbWrite(() => prisma.notification.updateMany({
      where: { recipientId: userId, readAt: null, ...(markAllRead ? { createdAt: { lte: readAt } } : { id: notificationId! }) },
      data: { readAt },
    }));
    return NextResponse.json({ ok: true, readAt: readAt.toISOString(), updatedCount: result.count });
  } catch (error) {
    if (error instanceof InputValidationError) return apiError("VALIDATION_ERROR", error.message, 400);
    return internalError("알림 상태를 변경하지 못했습니다.");
  }
}
