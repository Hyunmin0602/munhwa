import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ projectId: string; taskId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { taskId } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      title: data.title,
      description: data.description,
      columnId: data.columnId,
      assigneeId: data.assigneeId,
      priority: data.priority,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      order: data.order,
    },
    include: { assignee: { select: { id: true, name: true } } },
  });
  return NextResponse.json(task);
}

export async function DELETE(_: NextRequest, { params }: Params) {
  const { taskId } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.task.delete({ where: { id: taskId } });
  return NextResponse.json({ ok: true });
}
