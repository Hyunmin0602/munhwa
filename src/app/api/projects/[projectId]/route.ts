import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbReadRetry, withDbRetry, withDbWrite } from "@/lib/db-retry";
import { assertProjectAccess, assertProjectEditor, assertProjectOwner, canManageProject, recordActivity } from "@/lib/server-utils";
import { InputValidationError, optionalText, projectAccessScope, projectColor, projectStatus, projectTags, readJsonObject, requiredText } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

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

export async function GET(request: NextRequest, { params }: Params) {
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
    if (request.nextUrl.searchParams.get("view") === "archive-state") {
      const archiveState = await withDbReadRetry(() => prisma.project.findUnique({
        where: { id: projectId },
        select: { isArchived: true, accessScope: true },
      }));
      if (!archiveState) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(archiveState);
    }
    const canManageColumns = (await assertProjectOwner(userId, projectId)) || (await canManageProject(userId, projectId));

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
    return NextResponse.json({ ...project, permissions: { canManageColumns, canEdit: await assertProjectEditor(userId, projectId) } });
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
    const canEdit = (await assertProjectOwner(userId, projectId)) || (await canManageProject(userId, projectId));
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
    const isArchived = data.isArchived === undefined ? undefined : data.isArchived === true;
    if (data.isArchived !== undefined && typeof data.isArchived !== "boolean") throw new InputValidationError("기록용 여부가 올바르지 않습니다.");
    const existingArchiveState = await withDbReadRetry(() => prisma.project.findUnique({ where: { id: projectId }, select: { spaceId: true, name: true, description: true, category: true, tags: true, summary: true, status: true, color: true, isArchived: true, accessScope: true } }));
    if (!existingArchiveState) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existingArchiveState.isArchived && isArchived !== false) {
      const blockedFields = ["description", "category", "tags", "summary", "status", "color"];
      if (blockedFields.some((field) => data[field] !== undefined)) {
        return apiError("CONFLICT", "기록용 사업의 내용은 수정할 수 없습니다. 먼저 진행 사업으로 복원해주세요.", 409);
      }
    }
    const nextIsArchived = isArchived ?? existingArchiveState.isArchived;
    const accessScope = data.accessScope === undefined ? undefined : projectAccessScope(data.accessScope);
    if (accessScope !== undefined && !nextIsArchived) throw new InputValidationError("기록용 사업에서만 열람 범위를 설정할 수 있습니다.");

    const project = await withDbWrite(() =>
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
          ...(isArchived !== undefined ? { isArchived } : {}),
          ...(accessScope !== undefined ? { accessScope } : {}),
        },
      })
    );
    await recordActivity({ actorId: userId, spaceId: project.spaceId, projectId, type: "사업", action: "수정", entityType: "PROJECT", entityId: projectId, title: project.name, beforeData: existingArchiveState, afterData: { name: project.name, description: project.description, category: project.category, tags: project.tags, summary: project.summary, status: project.status, color: project.color, isArchived: project.isArchived, accessScope: project.accessScope } });
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

    const canDelete = (await assertProjectOwner(userId, projectId)) || (await canManageProject(userId, projectId));
    if (!canDelete)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const existing = await withDbReadRetry(() => prisma.project.findUnique({ where: { id: projectId }, select: { spaceId: true, name: true, isArchived: true, ownerId: true, accessScope: true } }));
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.isArchived) return apiError("CONFLICT", "기록용 사업은 삭제할 수 없습니다. 먼저 진행 사업으로 복원해주세요.", 409);
    await withDbWrite(() => prisma.project.delete({ where: { id: projectId } }));
    await recordActivity({ actorId: userId, spaceId: existing.spaceId, type: "사업", action: "삭제", entityType: "PROJECT", entityId: projectId, title: existing.name, beforeData: existing });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logApiError("DELETE", error);
    return NextResponse.json({ error: "프로젝트 삭제에 실패했습니다." }, { status: 500 });
  }
}
