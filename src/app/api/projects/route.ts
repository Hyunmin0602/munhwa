import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = session.user.id;
    const projects = await prisma.project.findMany({
      where: { members: { some: { userId } } },
      include: { members: { include: { user: { select: { id: true, name: true, image: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(projects);
  } catch {
    return NextResponse.json({ error: "외부 DB 연결 또는 서버 처리에 실패했습니다." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = session.user.id;
    const { name, description, color } = await req.json();
    if (!name) return NextResponse.json({ error: "프로젝트 이름이 필요합니다." }, { status: 400 });

    const project = await prisma.project.create({
      data: {
        name,
        description,
        color: color ?? "#6366f1",
        members: { create: { userId, role: "owner" } },
        columns: {
          create: [
            { name: "할 일", order: 0 },
            { name: "진행 중", order: 1 },
            { name: "완료", order: 2 },
          ],
        },
      },
      include: { members: true, columns: true },
    });
    return NextResponse.json(project, { status: 201 });
  } catch {
    return NextResponse.json({ error: "외부 DB 연결 또는 서버 처리에 실패했습니다." }, { status: 500 });
  }
}
