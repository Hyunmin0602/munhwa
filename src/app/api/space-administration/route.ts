import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbReadRetry, withDbWrite } from "@/lib/db-retry";
import { DEFAULT_SPACE_ID, canManageSpace } from "@/lib/server-utils";
import { forbidden, internalError, notFound, unauthorized, validationError } from "@/lib/api-error";

const SPACE_ID = "culture-sports";

async function requireCurrentSpaceAdmin() {
  const session = await auth();
  if (!session?.user?.id) return { response: unauthorized() };
  if (!(await canManageSpace(session.user.id, DEFAULT_SPACE_ID))) return { response: forbidden() };
  return { userId: session.user.id };
}

export async function GET() {
  const access = await requireCurrentSpaceAdmin();
  if ("response" in access) return access.response;

  const [space, transfers] = await withDbReadRetry(() =>
    Promise.all([
      prisma.space.findUnique({
        where: { id: SPACE_ID },
        select: {
          id: true,
          name: true,
          admin: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.spaceAdminTransferLog.findMany({
        where: { spaceId: SPACE_ID },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          createdAt: true,
          actor: { select: { id: true, name: true, email: true } },
          previousAdmin: { select: { id: true, name: true, email: true } },
          nextAdmin: { select: { id: true, name: true, email: true } },
        },
      }),
    ])
  );

  if (!space) return notFound("문화체육위원회 공간을 찾을 수 없습니다.");

  return NextResponse.json({ space: { id: space.id, name: space.name }, currentAdmin: space.admin, transfers });
}

export async function PATCH(request: NextRequest) {
  const access = await requireCurrentSpaceAdmin();
  if ("response" in access) return access.response;

  const body = await request.json();
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) {
    return validationError("후임 문화체육위원장 이메일을 입력해주세요.");
  }

  try {
    const result = await withDbWrite(() =>
      prisma.$transaction(async (tx) => {
        const space = await tx.space.findUnique({
          where: { id: SPACE_ID },
          select: { adminUserId: true },
        });
        const actor = await tx.user.findUnique({ where: { id: access.userId }, select: { role: true } });
        if (!space || (space.adminUserId !== access.userId && actor?.role !== "admin")) {
          throw new Error("CURRENT_ADMIN_CHANGED");
        }

        const nextAdmin = await tx.user.findUnique({
          where: { email },
          select: { id: true, name: true, email: true, role: true },
        });
        if (!nextAdmin) throw new Error("USER_NOT_FOUND");
        if (nextAdmin.id === access.userId) throw new Error("SAME_USER");
        await tx.space.update({
          where: { id: SPACE_ID },
          data: { adminUserId: nextAdmin.id },
        });
        await tx.spaceMember.upsert({
          where: { spaceId_userId: { spaceId: SPACE_ID, userId: nextAdmin.id } },
          update: { role: "admin" },
          create: { spaceId: SPACE_ID, userId: nextAdmin.id, role: "admin" },
        });
        await tx.spaceAdminTransferLog.create({
          data: {
            spaceId: SPACE_ID,
            actorUserId: access.userId,
            previousAdminUserId: access.userId,
            nextAdminUserId: nextAdmin.id,
          },
        });

        return { id: nextAdmin.id, name: nextAdmin.name, email: nextAdmin.email };
      })
    );
    return NextResponse.json({ currentAdmin: result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const message = {
      CURRENT_ADMIN_CHANGED: "관리자 권한이 이미 변경되었습니다. 새로고침 후 다시 확인해주세요.",
      USER_NOT_FOUND: "해당 이메일로 등록된 계정을 찾을 수 없습니다.",
      SAME_USER: "현재 관리자와 다른 후임 계정을 지정해주세요.",
      DEVELOPER_ADMIN: "개발자 admin 계정은 문화체육위원회 관리자로 지정할 수 없습니다.",
      }[code] ?? "관리자 권한 이전에 실패했습니다.";
    const status = code === "USER_NOT_FOUND" ? 404 : code === "UNKNOWN" ? 500 : 400;
    return status === 500 ? internalError(message) : status === 404 ? notFound(message) : validationError(message);
  }
}
