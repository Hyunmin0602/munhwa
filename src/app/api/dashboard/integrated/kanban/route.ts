import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbReadRetry } from "@/lib/db-retry";
import { DEFAULT_SPACE_ID, assertAdmin, assertSpaceManager } from "@/lib/server-utils";
import { internalError, unauthorized } from "@/lib/api-error";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const userId = session.user.id;
  const canViewAll = await assertAdmin(userId);
  const canViewSpace = !canViewAll && await assertSpaceManager(userId, DEFAULT_SPACE_ID);
  try {
    const projects = await withDbReadRetry(() => prisma.project.findMany({
      where: canViewAll ? {} : canViewSpace ? { spaceId: DEFAULT_SPACE_ID } : { members: { some: { userId } } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        color: true,
        members: { select: { user: { select: { id: true, name: true } } } },
        columns: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            name: true,
            order: true,
            integratedStatus: true,
            isIntegratedPrimary: true,
            tasks: { orderBy: [{ order: "asc" }, { updatedAt: "desc" }], select: { id: true, title: true, description: true, priority: true, dueDate: true, columnId: true, order: true, assignee: { select: { id: true, name: true } } } },
          },
        },
      },
    }), { operation: "dashboard:integrated:kanban" });
    return NextResponse.json({ items: projects });
  } catch (error) {
    console.error("[api/dashboard/integrated/kanban] GET failed", error);
    return internalError("통합 칸반을 불러오지 못했습니다.");
  }
}
