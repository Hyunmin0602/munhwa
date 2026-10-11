import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withDbReadRetry, withDbWrite } from "@/lib/db-retry";
import { prisma } from "@/lib/prisma";

const errorResponse = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message } }, { status });

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return errorResponse("UNAUTHORIZED", "로그인이 필요합니다.", 401);
  const user = await withDbReadRetry(() => prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true, name: true, email: true, role: true, cohort: { select: { name: true } }, createdAt: true,
      spaceMemberships: { select: { role: true, space: { select: { id: true, name: true } } } },
    },
  }));
  if (!user) return errorResponse("NOT_FOUND", "사용자 정보를 찾을 수 없습니다.", 404);
  return NextResponse.json(user);
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return errorResponse("UNAUTHORIZED", "로그인이 필요합니다.", 401);
  const userId = session.user.id;
  const user = await withDbReadRetry(() => prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      administeredSpaces: { select: { id: true, name: true } },
      administeredSpace: { select: { id: true } },
      ownedProjects: { select: { id: true, name: true } },
    },
  }));
  if (!user) return errorResponse("NOT_FOUND", "사용자 정보를 찾을 수 없습니다.", 404);
  if (user.role === "admin" || user.administeredSpaces.length || user.administeredSpace || user.ownedProjects.length) {
    return errorResponse("CONFLICT", "탈퇴 전에 담당 중인 공간 관리자 또는 사업 소유권을 다른 구성원에게 이전해 주세요.", 409);
  }
  await withDbWrite(() => prisma.$transaction([
    prisma.spaceMember.deleteMany({ where: { userId } }),
    prisma.projectMember.deleteMany({ where: { userId } }),
    prisma.archivePostCollaborator.deleteMany({ where: { userId } }),
    prisma.user.update({ where: { id: userId }, data: { registrationStatus: "WITHDRAWN", password: null } }),
  ]));
  return NextResponse.json({ ok: true });
}
