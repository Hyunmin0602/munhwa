import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ projectId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const count = await prisma.kanbanColumn.count({ where: { projectId } });
  const column = await prisma.kanbanColumn.create({
    data: { name: name.trim(), projectId, order: count },
  });
  return NextResponse.json({ ...column, tasks: [] }, { status: 201 });
}
