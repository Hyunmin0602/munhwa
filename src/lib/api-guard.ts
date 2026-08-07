import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";
import { NextResponse } from "next/server";

export function logApiError(scope: string, action: string, error: unknown) {
  console.error(`[${scope}] ${action} failed`, error);
}

export async function requireUserId() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return {
      userId: null,
      errorResponse: NextResponse.json(
        { error: "세션 정보가 유효하지 않습니다." },
        { status: 401 }
      ),
    };
  }

  return { userId, errorResponse: null };
}

export async function isProjectMember(userId: string, projectId: string) {
  const member = await withDbRetry(
    () =>
      prisma.projectMember.findUnique({
        where: { userId_projectId: { userId, projectId } },
      }),
    { operation: "isProjectMember" }
  );
  return !!member;
}

export async function isProjectOwner(userId: string, projectId: string) {
  const member = await withDbRetry(
    () =>
      prisma.projectMember.findUnique({
        where: { userId_projectId: { userId, projectId } },
      }),
    { operation: "isProjectOwner" }
  );
  return !!member && member.role === "owner";
}

export async function requireProjectMember(userId: string, projectId: string) {
  const member = await isProjectMember(userId, projectId);
  if (!member) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function requireProjectOwner(userId: string, projectId: string) {
  const owner = await isProjectOwner(userId, projectId);
  if (!owner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}