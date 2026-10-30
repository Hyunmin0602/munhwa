import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withDbReadRetry } from "@/lib/db-retry";
import { createInAppNotification } from "@/lib/notifications";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "인증이 필요합니다." } }, { status: 401 });
  }
  try {
    const now = new Date();
    const upcomingLimit = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    let cursor: { dueDate: Date; id: string } | null = null;
    let processed = 0;
    while (true) {
      const tasks = await withDbReadRetry(() => prisma.task.findMany({
        where: {
          assigneeId: { not: null }, dueDate: { lte: upcomingLimit },
          column: { project: { isArchived: false }, OR: [{ integratedStatus: null }, { integratedStatus: { not: "DONE" } }] },
          ...(cursor ? { OR: [{ dueDate: { gt: cursor.dueDate } }, { dueDate: cursor.dueDate, id: { gt: cursor.id } }] } : {}),
        },
        orderBy: [{ dueDate: "asc" }, { id: "asc" }], take: 200,
        select: { id: true, title: true, dueDate: true, assigneeId: true, column: { select: { integratedStatus: true, project: { select: { id: true, name: true } } } } },
      }), { operation: "notifications:due-tasks" });
      if (!tasks.length) break;
      const notificationRows = tasks.flatMap((task) => {
        if (!task.dueDate || !task.assigneeId || task.column.integratedStatus === "DONE") return [];
        const overdue = task.dueDate.getTime() < now.getTime();
        return [{ task, overdue, key: `due:${overdue ? "overdue" : "upcoming"}:${task.id}:${task.dueDate.toISOString()}` }];
      });
      // Preserve notifications created before recipient-scoped deduplication was introduced.
      const delivered = notificationRows.length ? await withDbReadRetry(() => prisma.notification.findMany({
        where: { dedupeKey: { in: notificationRows.flatMap((row) => [row.key, `${row.key}:${row.task.assigneeId}`]) } },
        select: { dedupeKey: true, recipientId: true }, take: 400,
      })) : [];
      const recipients = new Map(delivered.map((row) => [row.dedupeKey, row.recipientId]));
      for (const { task, overdue, key } of notificationRows) {
        if (recipients.get(key) === task.assigneeId || recipients.get(`${key}:${task.assigneeId}`) === task.assigneeId) continue;
        await createInAppNotification({
          recipientId: task.assigneeId!, category: "dueDate",
          title: overdue ? "마감일이 지난 업무가 있습니다." : "업무 마감일이 하루 이내입니다.",
          body: `${task.column.project.name} · ${task.title}`,
          href: `/dashboard/projects/${task.column.project.id}/kanban?task=${task.id}`,
          dedupeKey: `${key}:${task.assigneeId}`,
        });
      }
      processed += tasks.length;
      const last = tasks.at(-1)!;
      if (tasks.length < 200 || !last.dueDate) break;
      cursor = { dueDate: last.dueDate, id: last.id };
    }
    return NextResponse.json({ processed });
  } catch {
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "마감 알림을 처리하지 못했습니다." } }, { status: 500 });
  }
}
