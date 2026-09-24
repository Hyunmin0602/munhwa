import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbReadRetry } from "@/lib/db-retry";
import { assertAdmin } from "@/lib/server-utils";
import { forbidden, internalError, unauthorized } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  if (!(await assertAdmin(session.user.id))) return forbidden();

  try {
    const requestedLimit = Number(request.nextUrl.searchParams.get("limit"));
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 20, 1), 50);
    const logs = await withDbReadRetry(
      () => prisma.adminAuditLog.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        select: {
          id: true,
          action: true,
          targetType: true,
          targetId: true,
          beforeData: true,
          afterData: true,
          reason: true,
          createdAt: true,
          actor: { select: { id: true, name: true, email: true } },
          space: { select: { id: true, name: true } },
        },
      }),
      { operation: `admin:audit-logs:list:${session.user.id}` },
    );
    return NextResponse.json({ items: logs, nextCursor: null });
  } catch {
    return internalError("관리자 감사 로그를 불러오지 못했습니다.");
  }
}
