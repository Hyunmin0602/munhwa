import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbReadRetry } from "@/lib/db-retry";
import { DEFAULT_SPACE_ID } from "@/lib/server-utils";
import { internalError, notFound, unauthorized } from "@/lib/api-error";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  try {
    const space = await withDbReadRetry(async () => {
      const membership = await prisma.spaceMember.findFirst({
        where: { userId: session.user.id },
        orderBy: { joinedAt: "asc" },
        select: { space: { select: { id: true, name: true } } },
      });
      return membership?.space ?? prisma.space.findUnique({ where: { id: DEFAULT_SPACE_ID }, select: { id: true, name: true } });
    },
      { operation: "space-context:get" },
    );
    if (!space) return notFound("소속 공간을 찾을 수 없습니다.");
    return NextResponse.json({ space });
  } catch (error) {
    console.error("[api/space-context] GET failed", error);
    return internalError("소속 공간 정보를 불러오지 못했습니다.");
  }
}
