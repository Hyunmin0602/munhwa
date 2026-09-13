import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { withDbRetry } from "@/lib/db-retry";
import { prisma } from "@/lib/prisma";
import { assertProjectAccess, assertProjectOwner, canManageCultureSportsContent } from "@/lib/server-utils";
import { booleanValue, InputValidationError, integratedKanbanStatus, readJsonObject } from "@/lib/validation";

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

    if (!(await assertProjectAccess(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const existing = await withDbRetry(() => prisma.kanbanColumn.findFirst({ where: { id: columnId, projectId } }));
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data = await readJsonObject(req);
    const updateData: { name?: string; order?: number; integratedStatus?: string | null; isIntegratedPrimary?: boolean } = {};

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

    const updatesIntegratedMapping = data.integratedStatus !== undefined || data.isIntegratedPrimary !== undefined;
    if (updatesIntegratedMapping) {
      const canManageMapping = (await assertProjectOwner(userId, projectId)) || (await canManageCultureSportsContent(userId));
      if (!canManageMapping) return NextResponse.json({ error: "통합 상태 설정 권한이 없습니다." }, { status: 403 });
      if (data.integratedStatus !== undefined) updateData.integratedStatus = integratedKanbanStatus(data.integratedStatus);
      if (data.isIntegratedPrimary !== undefined) updateData.isIntegratedPrimary = booleanValue(data.isIntegratedPrimary, "대표 열");
      const resultingStatus = updateData.integratedStatus === undefined ? existing.integratedStatus : updateData.integratedStatus;
      if (updateData.isIntegratedPrimary && !resultingStatus) return NextResponse.json({ error: "대표 열은 통합 상태를 선택한 뒤 지정할 수 있습니다." }, { status: 400 });
      if (resultingStatus === null) updateData.isIntegratedPrimary = false;
    }

    if (Object.keys(updateData).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

    const column = await withDbRetry(() => prisma.$transaction(async (tx) => {
      if (updateData.isIntegratedPrimary && updateData.integratedStatus) {
        await tx.kanbanColumn.updateMany({
          where: { projectId, integratedStatus: updateData.integratedStatus, id: { not: columnId } },
          data: { isIntegratedPrimary: false },
        });
      }
      return tx.kanbanColumn.update({ where: { id: columnId }, data: updateData });
    }));
    return NextResponse.json(column);
  } catch (error) {
    if (error instanceof InputValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
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

    if (!(await assertProjectAccess(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const existing = await withDbRetry(() => prisma.kanbanColumn.findFirst({ where: { id: columnId, projectId } }));
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await withDbRetry(() => prisma.kanbanColumn.delete({ where: { id: columnId } }));
    return NextResponse.json({ ok: true });
  } catch (error) {
    logApiError("DELETE", error);
    return NextResponse.json({ error: "컬럼 삭제에 실패했습니다." }, { status: 500 });
  }
}
