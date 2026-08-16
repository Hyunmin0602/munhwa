import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";
import { assertAdmin, assertProjectAccess, assertProjectOwner } from "@/lib/server-utils";

type Params = { params: Promise<{ projectId: string }> };

function logApiError(action: string, error: unknown) {
  console.error(`[api/projects/:projectId] ${action} failed`, error);
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

    const project = await withDbRetry(
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
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(project);
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
    const canEdit = (await assertProjectOwner(userId, projectId)) || (await assertAdmin(userId));
    if (!canEdit)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const data = await req.json();
    const name = typeof data.name === "string" ? data.name.trim() : undefined;
    if (data.name !== undefined && !name) {
      return NextResponse.json({ error: "프로젝트 이름이 필요합니다." }, { status: 400 });
    }

    const project = await withDbRetry(() =>
      prisma.project.update({
        where: { id: projectId },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.summary !== undefined ? { summary: data.summary } : {}),
          ...(typeof data.status === "string" && data.status.trim() ? { status: data.status.trim() } : {}),
          ...(data.color !== undefined ? { color: data.color } : {}),
        },
      }),
      { operation: `project:update:${projectId}` }
    );
    return NextResponse.json(project);
  } catch (error) {
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

    const isOwner = await assertProjectOwner(userId, projectId);
    if (!isOwner)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await withDbRetry(() => prisma.project.delete({ where: { id: projectId } }), { operation: `project:delete:${projectId}` });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logApiError("DELETE", error);
    return NextResponse.json({ error: "프로젝트 삭제에 실패했습니다." }, { status: 500 });
  }
}
