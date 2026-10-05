import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbWrite } from "@/lib/db-retry";
import { assertAdmin } from "@/lib/server-utils";
import { forbidden, internalError, notFound, unauthorized, validationError } from "@/lib/api-error";

type Params = { params: Promise<{ projectId: string }> };

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return { response: unauthorized() };
  if (!(await assertAdmin(session.user.id))) return { response: forbidden() };
  return { userId: session.user.id };
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const access = await requireAdmin();
  if ("response" in access) return access.response;

  const { projectId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationError("올바른 JSON 요청이 필요합니다.");
  }

  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const userId = typeof payload.userId === "string" ? payload.userId : "";
  const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, 500) : null;
  if (!userId) return validationError("새 사업 관리자 사용자를 선택해주세요.");

  try {
    const result = await withDbWrite(() => prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          name: true,
          spaceId: true,
          owner: { select: { id: true, name: true, email: true } },
        },
      });
      if (!project) throw new Error("PROJECT_NOT_FOUND");
      if (project.owner?.id === userId) throw new Error("SAME_OWNER");

      const targetMember = await tx.projectMember.findUnique({
        where: { userId_projectId: { userId, projectId } },
        select: { user: { select: { id: true, name: true, email: true } } },
      });
      if (!targetMember) throw new Error("NOT_PROJECT_MEMBER");

      const updated = await tx.project.update({
        where: { id: projectId },
        data: { ownerId: userId },
        select: { id: true, name: true, owner: { select: { id: true, name: true, email: true } } },
      });

      if (project.owner?.id) {
        await tx.projectMember.updateMany({
          where: { projectId, userId: project.owner.id, role: "owner" },
          data: { role: "member" },
        });
      }
      await tx.projectMember.update({
        where: { userId_projectId: { userId, projectId } },
        data: { role: "owner" },
      });

      await tx.adminAuditLog.create({
        data: {
          id: randomUUID(),
          actorUserId: access.userId,
          spaceId: project.spaceId,
          action: "PROJECT_OWNER_CHANGED",
          targetType: "PROJECT",
          targetId: project.id,
          beforeData: JSON.stringify(project.owner),
          afterData: JSON.stringify(updated.owner),
          reason,
        },
      });

      return updated;
    }));
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "PROJECT_NOT_FOUND") return notFound("사업을 찾을 수 없습니다.");
    if (code === "SAME_OWNER") return validationError("현재 관리자와 다른 사용자를 선택해주세요.");
    if (code === "NOT_PROJECT_MEMBER") return validationError("사업 참여자만 사업 관리자로 지정할 수 있습니다.");
    return internalError("사업 관리자 변경에 실패했습니다.");
  }
}
