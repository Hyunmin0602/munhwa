import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";
import { assertProjectAccess, assertProjectOwner, canManageCultureSportsContent } from "@/lib/server-utils";
import { InputValidationError, optionalText, projectColor, projectStatus, projectTags, readJsonObject, requiredText } from "@/lib/validation";

type Params = { params: Promise<{ projectId: string }> };

function logApiError(action: string, error: unknown) {
  console.error(`[api/projects/:projectId] ${action} failed`, error);
}

function isMissingIntegratedKanbanField(error: unknown) {
  return error instanceof Error && /integratedStatus|isIntegratedPrimary/i.test(error.message);
}

function legacyIntegratedStatus(name: string, order: number) {
  const normalized = name.trim().toLowerCase();
  if (/할 일|진행 전|todo|backlog/.test(normalized)) return "BEFORE";
  if (/진행 중|in progress|doing/.test(normalized)) return "IN_PROGRESS";
  if (/완료|done|complete/.test(normalized)) return "DONE";
  return ["BEFORE", "IN_PROGRESS", "DONE"][order] ?? null;
}

// use common assertProjectMember from server-utils

export async function GET(_: NextRequest, { params }: Params) {
  try {
    const { projectId } = await params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!session.user.id) {
      return NextResponse.json({ error: "세션 정보가 유효하지 않습니다." }, { status: 401 });
    }
    const userId = session.user.id;
    if (!(await assertProjectAccess(userId, projectId)))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const canManageColumns = (await assertProjectOwner(userId, projectId)) || (await canManageCultureSportsContent(userId));

    let project;
    try {
      project = await withDbRetry(
        () =>
          prisma.project.findUnique({
            where: { id: projectId },
            include: {
              members: { include: { user: { select: { id: true, name: true, image: true } } } },
              columns: { include: { tasks: { include: { assignee: { select: { id: true, name: true } } }, orderBy: { order: "asc" } } }, orderBy: { order: "asc" } },
            },
          }),
        { operation: `project:get:${projectId}` }
      );
    } catch (error) {
      if (!isMissingIntegratedKanbanField(error)) throw error;

      const legacyProject = await withDbRetry(
        () =>
          prisma.project.findUnique({
          where: { id: projectId },
          include: {
            members: { include: { user: { select: { id: true, name: true, image: true } } } },
            columns: {
              select: {
                id: true,
                name: true,
                order: true,
                projectId: true,
                createdAt: true,
                tasks: { include: { assignee: { select: { id: true, name: true } } }, orderBy: { order: "asc" } },
              },
              orderBy: { order: "asc" },
            },
          },
        }),
        { operation: `project:get-legacy-kanban:${projectId}` }
      );
      project = legacyProject && {
        ...legacyProject,
        columns: legacyProject.columns.map((column) => {
          const integratedStatus = legacyIntegratedStatus(column.name, column.order);
          return { ...column, integratedStatus, isIntegratedPrimary: integratedStatus !== null };
        }),
      };
    }
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ...project, permissions: { canManageColumns } });
  } catch (error) {
    logApiError("GET", error);
    return NextResponse.json({ error: "프로젝트 정보를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { projectId } = await params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!session.user.id) {
      return NextResponse.json({ error: "세션 정보가 유효하지 않습니다." }, { status: 401 });
    }
    const userId = session.user.id;
    const canEdit = (await assertProjectOwner(userId, projectId)) || (await canManageCultureSportsContent(userId));
    if (!canEdit)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const data = await readJsonObject(req);
    const name = data.name === undefined ? undefined : requiredText(data.name, "프로젝트 이름", 100);
    const description = data.description === undefined ? undefined : optionalText(data.description, "상세 설명", 5_000);
    const category = data.category === undefined ? undefined : optionalText(data.category, "카테고리", 50);
    const tags = data.tags === undefined ? undefined : projectTags(data.tags);
    const summary = data.summary === undefined ? undefined : optionalText(data.summary, "요약", 300);
    const status = data.status === undefined ? undefined : projectStatus(data.status);
    const color = data.color === undefined ? undefined : projectColor(data.color);

    const project = await withDbRetry(() =>
      prisma.project.update({
        where: { id: projectId },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(category !== undefined ? { category } : {}),
          ...(tags !== undefined ? { tags } : {}),
          ...(summary !== undefined ? { summary } : {}),
          ...(status !== undefined ? { status } : {}),
          ...(color !== undefined ? { color } : {}),
        },
      }),
      { operation: `project:update:${projectId}` }
    );
    return NextResponse.json(project);
  } catch (error) {
    if (error instanceof InputValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    logApiError("PATCH", error);
    return NextResponse.json({ error: "프로젝트 수정에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: Params) {
  try {
    const { projectId } = await params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!session.user.id) {
      return NextResponse.json({ error: "세션 정보가 유효하지 않습니다." }, { status: 401 });
    }
    const userId = session.user.id;

    const canDelete = (await assertProjectOwner(userId, projectId)) || (await canManageCultureSportsContent(userId));
    if (!canDelete)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await withDbRetry(() => prisma.project.delete({ where: { id: projectId } }), { operation: `project:delete:${projectId}` });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logApiError("DELETE", error);
    return NextResponse.json({ error: "프로젝트 삭제에 실패했습니다." }, { status: 500 });
  }
}
