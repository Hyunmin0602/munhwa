import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbReadRetry } from "@/lib/db-retry";
import { DEFAULT_SPACE_ID, assertSpaceManager } from "@/lib/server-utils";
import { forbidden, internalError, unauthorized } from "@/lib/api-error";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  if (!(await assertSpaceManager(session.user.id, DEFAULT_SPACE_ID))) return forbidden();
  try {
    const projects = await withDbReadRetry(() => prisma.project.findMany({
      where: { spaceId: DEFAULT_SPACE_ID },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        updatedAt: true,
        owner: { select: { id: true, name: true, email: true } },
        members: { orderBy: { joinedAt: "asc" }, select: { id: true, role: true, user: { select: { id: true, name: true, email: true } } } },
        _count: { select: { members: true, archivePosts: true, events: true, columns: true } },
      },
    }), { operation: "space-management:projects:list" });
    return NextResponse.json({ items: projects });
  } catch (error) {
    console.error("[api/space-management/projects] GET failed", error);
    return internalError("사업 관리 목록을 불러오지 못했습니다.");
  }
}
