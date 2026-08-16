import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { withDbRetry } from "@/lib/db-retry";
import { prisma } from "@/lib/prisma";
import { assertProjectAccess } from "@/lib/server-utils";

function logApiError(action: string, error: unknown) {
  console.error(`[api/projects/:projectId/columns] ${action} failed`, error);
}

type Params = { params: Promise<{ projectId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { projectId } = await params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    if (!(await assertProjectAccess(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { name } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

    const count = await withDbRetry(() => prisma.kanbanColumn.count({ where: { projectId } }));
    const column = await withDbRetry(() => prisma.kanbanColumn.create({ data: { name: name.trim(), projectId, order: count } }));
    return NextResponse.json({ ...column, tasks: [] }, { status: 201 });
  } catch (error) {
    logApiError("POST", error);
    return NextResponse.json({ error: "컬럼 생성에 실패했습니다." }, { status: 500 });
  }
}
