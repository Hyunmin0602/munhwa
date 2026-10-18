import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { apiError, internalError, unauthorized } from "@/lib/api-error";
import { withDbReadRetry, withDbWrite } from "@/lib/db-retry";
import { prisma } from "@/lib/prisma";
import { readJsonObject } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return unauthorized();
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit")) || 30, 1), 50);
  const encodedCursor = request.nextUrl.searchParams.get("cursor");
  let cursor: { createdAt: Date; id: string } | null = null;
  if (encodedCursor) {
    try {
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
        where: { recipientId: userId, ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) },
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
    if (data.markAllRead === true) {
      await withDbWrite(() => prisma.notification.updateMany({ where: { recipientId: userId, readAt: null }, data: { readAt: new Date() } }));
      return NextResponse.json({ ok: true });
    }
    if (typeof data.notificationId !== "string" || !data.notificationId) return apiError("VALIDATION_ERROR", "알림을 지정해주세요.", 400);
    await withDbWrite(() => prisma.notification.updateMany({ where: { id: data.notificationId as string, recipientId: userId, readAt: null }, data: { readAt: new Date() } }));
    return NextResponse.json({ ok: true });
  } catch {
    return internalError("알림 상태를 변경하지 못했습니다.");
  }
}
