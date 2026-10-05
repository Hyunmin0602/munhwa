import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbReadRetry } from "@/lib/db-retry";
import { assertProjectAccess, assertProjectOwner, canManageProject } from "@/lib/server-utils";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, { params }: Params) {
  void request;
  const { projectId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  if (!(await assertProjectAccess(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const [project, canManageColumns] = await withDbReadRetry(() => Promise.all([
      prisma.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          columns: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              name: true,
              order: true,
              projectId: true,
              integratedStatus: true,
              isIntegratedPrimary: true,
              tasks: { orderBy: [{ order: "asc" }, { updatedAt: "desc" }], select: { id: true, title: true, priority: true, dueDate: true, columnId: true, assignee: { select: { id: true, name: true } } } },
            },
          },
          members: { select: { role: true, user: { select: { id: true, name: true } } } },
        },
      }),
      Promise.all([assertProjectOwner(userId, projectId), canManageProject(userId, projectId)]).then(([isOwner, isManager]) => isOwner || isManager),
    ]), { operation: `project:kanban-summary:${projectId}` });
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ...project, permissions: { canManageColumns } });
  } catch (error) {
    console.error("[api/projects/:projectId/kanban/summary] GET failed", error);
    return NextResponse.json({ error: "칸반 요약을 불러오지 못했습니다." }, { status: 500 });
  }
}
