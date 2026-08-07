import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { withDbRetry } from "@/lib/db-retry";
import { prisma } from "@/lib/prisma";
import { assertProjectMember } from "@/lib/server-utils";

function logApiError(action: string, error: unknown) {
  console.error(`[api/projects/:projectId/columns/:columnId] ${action} failed`, error);
}

type Params = { params: Promise<{ projectId: string; columnId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { projectId, columnId } = await params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    if (!(await assertProjectMember(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const existing = await withDbRetry(() => prisma.kanbanColumn.findFirst({ where: { id: columnId, projectId } }));
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data = await req.json();
    const updateData: { name?: string; order?: number } = {};

    if (data.name !== undefined) {
      const name = typeof data.name === "string" ? data.name.trim() : "";
      if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
      updateData.name = name;
    }

    if (data.order !== undefined) {
      const order = Number(data.order);
      if (!Number.isInteger(order) || order < 0) return NextResponse.json({ error: "invalid order" }, { status: 400 });
      updateData.order = order;
    }

    if (Object.keys(updateData).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

    const column = await withDbRetry(() => prisma.kanbanColumn.update({ where: { id: columnId }, data: updateData }));
    return NextResponse.json(column);
  } catch (error) {
    logApiError("PATCH", error);
    return NextResponse.json({ error: "컬럼 수정에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: Params) {
  try {
    const { projectId, columnId } = await params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    if (!(await assertProjectMember(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const existing = await withDbRetry(() => prisma.kanbanColumn.findFirst({ where: { id: columnId, projectId } }));
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await withDbRetry(() => prisma.kanbanColumn.delete({ where: { id: columnId } }));
    return NextResponse.json({ ok: true });
  } catch (error) {
    logApiError("DELETE", error);
    return NextResponse.json({ error: "컬럼 삭제에 실패했습니다." }, { status: 500 });
  }
}
