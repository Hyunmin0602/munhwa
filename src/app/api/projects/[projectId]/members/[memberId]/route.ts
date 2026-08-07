import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { assertProjectOwner } from "@/lib/server-utils";
import { withDbRetry } from "@/lib/db-retry";

function logApiError(action: string, error: unknown) {
  console.error(`[api/projects/:projectId/members/:memberId] ${action} failed`, error);
}

type Params = { params: Promise<{ projectId: string; memberId: string }> };

export async function DELETE(_: NextRequest, { params }: Params) {
  try {
    const { projectId, memberId } = await params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;
    if (!(await assertProjectOwner(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const existing = await withDbRetry(() => prisma.projectMember.findUnique({ where: { id: memberId } }));
    if (!existing || existing.projectId !== projectId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // prevent deleting last owner
    if (existing.role === "owner") {
      const ownerCount = await withDbRetry(() => prisma.projectMember.count({ where: { projectId, role: "owner" } }));
      if (ownerCount <= 1) return NextResponse.json({ error: "Cannot remove last owner" }, { status: 400 });
    }

    await withDbRetry(() => prisma.projectMember.delete({ where: { id: memberId } }));
    return NextResponse.json({ ok: true });
  } catch (error) {
    logApiError("DELETE", error);
    return NextResponse.json({ error: "멤버 삭제에 실패했습니다." }, { status: 500 });
  }
}
