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
    const tasks = await withDbReadRetry(() => prisma.task.findMany({
      where: { assigneeId: { not: null }, dueDate: { lte: upcomingLimit }, column: { project: { isArchived: false } } },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: 500,
      select: { id: true, title: true, dueDate: true, assigneeId: true, column: { select: { integratedStatus: true, project: { select: { id: true, name: true } } } } },
    }), { operation: "notifications:due-tasks" });
    for (const task of tasks) {
      if (!task.dueDate || !task.assigneeId || task.column.integratedStatus === "DONE") continue;
      const overdue = task.dueDate.getTime() < now.getTime();
      const category = overdue ? "overdue" : "upcoming";
      await createInAppNotification({
        recipientId: task.assigneeId,
        category: "dueDate",
        title: overdue ? "마감일이 지난 업무가 있습니다." : "업무 마감일이 하루 이내입니다.",
        body: `${task.column.project.name} · ${task.title}`,
        href: `/dashboard/projects/${task.column.project.id}/kanban?task=${task.id}`,
        dedupeKey: `due:${category}:${task.id}:${task.dueDate.toISOString()}`,
      });
    }
    return NextResponse.json({ processed: tasks.length });
  } catch {
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "마감 알림을 처리하지 못했습니다." } }, { status: 500 });
  }
}
