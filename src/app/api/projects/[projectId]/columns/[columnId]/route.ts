import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ projectId: string; columnId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { columnId } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  const updateData: { name?: string; order?: number } = {};

  if (data.name !== undefined) {
    const name = typeof data.name === "string" ? data.name.trim() : "";
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    updateData.name = name;
  }

  if (data.order !== undefined) {
    const order = Number(data.order);
    if (!Number.isInteger(order) || order < 0) return NextResponse.json({ error: "invalid order" }, { status: 400 });
    updateData.order = order;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const column = await prisma.kanbanColumn.update({
    where: { id: columnId },
    data: updateData,
  });
  return NextResponse.json(column);
}

export async function DELETE(_: NextRequest, { params }: Params) {
  const { columnId } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.kanbanColumn.delete({ where: { id: columnId } });
  return NextResponse.json({ ok: true });
}
