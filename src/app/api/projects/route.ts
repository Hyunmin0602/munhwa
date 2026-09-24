import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbReadRetry, withDbWrite } from "@/lib/db-retry";
import { DEFAULT_SPACE_ID, assertAdmin, assertSpaceAdmin } from "@/lib/server-utils";
import { InputValidationError, optionalText, projectColor, projectStatus, projectTags, readJsonObject, requiredText } from "@/lib/validation";
import { internalError, unauthorized, validationError } from "@/lib/api-error";

function logApiError(action: string, error: unknown) {
  console.error(`[api/projects] ${action} failed`, error);
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return unauthorized();
    if (!session.user.id) {
      return unauthorized("세션 정보가 유효하지 않습니다.");
    }

    const userId = session.user.id;
    const canViewAll = await assertAdmin(userId);
    const canViewSpace = !canViewAll && await assertSpaceAdmin(userId);
    const rawLimit = request.nextUrl.searchParams.get("limit");
    const requestedLimit = rawLimit ? Number(rawLimit) : 30;
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 30, 1), 50);
    const cursor = request.nextUrl.searchParams.get("cursor");
    const projects = await withDbReadRetry(
      () =>
        prisma.project.findMany({
          where: canViewAll
            ? {}
            : canViewSpace
              ? { spaceId: DEFAULT_SPACE_ID }
              : { members: { some: { userId } } },
          select: {
            id: true,
            name: true,
            description: true,
            category: true,
            tags: true,
            summary: true,
            status: true,
            color: true,
            order: true,
            sharingMode: true,
            createdAt: true,
            updatedAt: true,
            members: { select: { user: { select: { id: true, name: true, image: true } } } },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          take: limit + 1,
        }),
      { operation: `projects:list:${userId}` }
    );
    const hasMore = projects.length > limit;
    const items = projects.slice(0, limit);
    return NextResponse.json({
      items,
      nextCursor: hasMore ? items.at(-1)?.id ?? null : null,
      accessScope: canViewAll ? "ADMIN_ALL" : canViewSpace ? "SPACE_ALL" : "MEMBER_ONLY",
      totalReturned: items.length,
    });
  } catch (error) {
    logApiError("GET", error);
    return internalError("프로젝트 목록을 불러오지 못했습니다.");
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return unauthorized();
    if (!session.user.id) {
      return unauthorized("세션 정보가 유효하지 않습니다.");
    }

    const userId = session.user.id;
    const data = await readJsonObject(req);
    const name = requiredText(data.name, "프로젝트 이름", 100);
    const description = optionalText(data.description, "상세 설명", 1_000);
    const category = optionalText(data.category, "카테고리", 50);
    const tags = projectTags(data.tags);
    const summary = optionalText(data.summary, "요약", 300);
    const status = projectStatus(data.status);
    const color = projectColor(data.color);

    const project = await withDbWrite(() => prisma.$transaction(async (tx) => {
      const createdProject = await tx.project.create({
        data: {
          spaceId: DEFAULT_SPACE_ID,
          ownerId: userId,
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
      });
      await tx.spaceMember.upsert({
        where: { spaceId_userId: { spaceId: DEFAULT_SPACE_ID, userId } },
        update: {},
        create: { spaceId: DEFAULT_SPACE_ID, userId, role: "member" },
      });
      return createdProject;
    }));
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    if (error instanceof InputValidationError) return validationError(error.message);
    logApiError("POST", error);
    return internalError("프로젝트 생성에 실패했습니다.");
  }
}
