import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";
import { canManageCultureSportsContent } from "@/lib/server-utils";
import { InputValidationError, optionalText, projectColor, projectStatus, projectTags, readJsonObject, requiredText } from "@/lib/validation";

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
    const canViewAll = await canManageCultureSportsContent(userId);
    const projects = await withDbRetry(
      () =>
        prisma.project.findMany({
          where: canViewAll ? {} : { members: { some: { userId } } },
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
    const data = await readJsonObject(req);
    const name = requiredText(data.name, "프로젝트 이름", 100);
    const description = optionalText(data.description, "상세 설명", 5_000);
    const category = optionalText(data.category, "카테고리", 50);
    const tags = projectTags(data.tags);
    const summary = optionalText(data.summary, "요약", 300);
    const status = projectStatus(data.status);
    const color = projectColor(data.color);

    const project = await withDbRetry(
      () =>
        prisma.project.create({
          data: {
            name,
            description,
            category,
            tags,
            summary,
            status,
            color,
            members: { create: { userId, role: "owner" } },
            columns: {
              create: [
                { name: "할 일", order: 0, integratedStatus: "BEFORE", isIntegratedPrimary: true },
                { name: "진행 중", order: 1, integratedStatus: "IN_PROGRESS", isIntegratedPrimary: true },
                { name: "완료", order: 2, integratedStatus: "DONE", isIntegratedPrimary: true },
              ],
            },
          },
          include: { members: true, columns: true },
        }),
      { operation: `projects:create:${userId}` }
    );
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    if (error instanceof InputValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    logApiError("POST", error);
    return NextResponse.json({ error: "프로젝트 생성에 실패했습니다." }, { status: 500 });
  }
}
