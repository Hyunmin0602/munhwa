import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ projectId: string }> };

async function assertMember(userId: string, projectId: string) {
  const member = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
  });
  return !!member;
}

export async function GET(_: NextRequest, { params }: Params) {
  try {
    const { projectId } = await params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;
    if (!(await assertMember(userId, projectId)))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        members: { include: { user: { select: { id: true, name: true, image: true } } } },
        columns: { include: { tasks: { include: { assignee: { select: { id: true, name: true } } }, orderBy: { order: "asc" } } }, orderBy: { order: "asc" } },
      },
    });
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(project);
  } catch {
    return NextResponse.json({ error: "외부 DB 연결 또는 서버 처리에 실패했습니다." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { projectId } = await params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;
    if (!(await assertMember(userId, projectId)))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const data = await req.json();
    const name = typeof data.name === "string" ? data.name.trim() : undefined;
    if (data.name !== undefined && !name) {
      return NextResponse.json({ error: "프로젝트 이름이 필요합니다." }, { status: 400 });
    }

    const project = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
      },
    });
    return NextResponse.json(project);
  } catch {
    return NextResponse.json({ error: "외부 DB 연결 또는 서버 처리에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: Params) {
  try {
    const { projectId } = await params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    const member = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } },
    });
    if (!member || member.role !== "owner")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await prisma.project.delete({ where: { id: projectId } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "외부 DB 연결 또는 서버 처리에 실패했습니다." }, { status: 500 });
  }
}
