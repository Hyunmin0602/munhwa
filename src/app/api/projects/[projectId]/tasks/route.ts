import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tasks = await prisma.task.findMany({
    where: { column: { projectId } },
    include: { assignee: { select: { id: true, name: true } }, column: true },
    orderBy: { order: "asc" },
  });
  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { title, description, columnId, assigneeId, priority, dueDate } = await req.json();
  if (!title || !columnId) return NextResponse.json({ error: "title/columnId required" }, { status: 400 });

  // verify column belongs to project
  const column = await prisma.kanbanColumn.findFirst({ where: { id: columnId, projectId } });
  if (!column) return NextResponse.json({ error: "Column not found" }, { status: 404 });

  const count = await prisma.task.count({ where: { columnId } });
  const task = await prisma.task.create({
    data: {
      title,
      description,
      columnId,
      creatorId: userId,
      assigneeId: assigneeId ?? null,
      priority: priority ?? "medium",
      dueDate: dueDate ? new Date(dueDate) : null,
      order: count,
    },
    include: { assignee: { select: { id: true, name: true } } },
  });
  return NextResponse.json(task, { status: 201 });
}
