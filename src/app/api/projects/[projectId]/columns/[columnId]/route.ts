import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ projectId: string; columnId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { columnId } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await req.json();
  const column = await prisma.kanbanColumn.update({
    where: { id: columnId },
    data: { name: name?.trim() },
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
