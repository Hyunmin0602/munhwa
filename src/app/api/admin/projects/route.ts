import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbReadRetry } from "@/lib/db-retry";
import { assertAdmin } from "@/lib/server-utils";
import { forbidden, internalError, unauthorized } from "@/lib/api-error";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return { response: unauthorized() };
  if (!(await assertAdmin(session.user.id))) return { response: forbidden() };
  return { userId: session.user.id };
}

export async function GET(request: NextRequest) {
  const access = await requireAdmin();
  if ("response" in access) return access.response;

  try {
    const requestedLimit = Number(request.nextUrl.searchParams.get("limit"));
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 30, 1), 50);
    const cursor = request.nextUrl.searchParams.get("cursor");
    const projects = await withDbReadRetry(
      () => prisma.project.findMany({
        select: {
          id: true,
          name: true,
          status: true,
          updatedAt: true,
          space: { select: { id: true, name: true, slug: true, admin: { select: { id: true, name: true, email: true } } } },
          owner: { select: { id: true, name: true, email: true } },
          members: { select: { user: { select: { id: true, name: true, email: true } } }, orderBy: { joinedAt: "asc" } },
          _count: { select: { members: true } },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: limit + 1,
      }),
      { operation: `admin:projects:list:${access.userId}` },
    );

    const hasMore = projects.length > limit;
    const items = projects.slice(0, limit);
    return NextResponse.json({
      items,
      nextCursor: hasMore ? items.at(-1)?.id ?? null : null,
    });
  } catch {
    return internalError("사업 관리자 목록을 불러오지 못했습니다.");
  }
}
