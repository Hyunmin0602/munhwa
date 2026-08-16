import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";

function logApiError(action: string, error: unknown) {
  console.error(`[api/projects] ${action} failed`, error);
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!session.user.id) {
      return NextResponse.json({ error: "세션 정보가 유효하지 않습니다." }, { status: 401 });
    }

    const userId = session.user.id;
    const projects = await withDbRetry(
      () =>
        prisma.project.findMany({
          where: { members: { some: { userId } } },
          include: { members: { include: { user: { select: { id: true, name: true, image: true } } } } },
          orderBy: { createdAt: "desc" },
        }),
      { operation: `projects:list:${userId}` }
    );
    return NextResponse.json(projects);
  } catch (error) {
    logApiError("GET", error);
    return NextResponse.json({ error: "프로젝트 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!session.user.id) {
      return NextResponse.json({ error: "세션 정보가 유효하지 않습니다." }, { status: 401 });
    }

    const userId = session.user.id;
    const { name, description, category, tags, summary, status, color } = await req.json();
    if (!name) return NextResponse.json({ error: "프로젝트 이름이 필요합니다." }, { status: 400 });
    const normalizedTags = Array.isArray(tags)
      ? [...new Set(tags.filter((tag: unknown): tag is string => typeof tag === "string").map((tag: string) => tag.trim()).filter(Boolean))].join(",") || null
      : null;

    const project = await withDbRetry(
      () =>
        prisma.project.create({
          data: {
            name,
            description,
            category: typeof category === "string" ? category.trim() || null : null,
            tags: normalizedTags,
            summary: typeof summary === "string" ? summary.trim() || null : null,
            status: typeof status === "string" && status.trim() ? status.trim() : "planning",
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
        }),
      { operation: `projects:create:${userId}` }
    );
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    logApiError("POST", error);
    return NextResponse.json({ error: "프로젝트 생성에 실패했습니다." }, { status: 500 });
  }
}
