import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";
import { assertSpaceAdmin } from "@/lib/server-utils";

const SPACE_ID = "culture-sports";

async function requireCurrentSpaceAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!(await assertSpaceAdmin(session.user.id))) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { userId: session.user.id };
}

export async function GET() {
  const access = await requireCurrentSpaceAdmin();
  if ("response" in access) return access.response;

  const [administration, transfers] = await withDbRetry(() =>
    Promise.all([
      prisma.spaceAdministration.findUnique({
        where: { id: SPACE_ID },
        select: {
          spaceAdmin: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.spaceAdminTransferLog.findMany({
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

  if (!administration) {
    return NextResponse.json({ error: "문화체육위원회 관리자 설정을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ currentAdmin: administration.spaceAdmin, transfers });
}

export async function PATCH(request: NextRequest) {
  const access = await requireCurrentSpaceAdmin();
  if ("response" in access) return access.response;

  const body = await request.json();
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) {
    return NextResponse.json({ error: "후임 문화체육위원장 이메일을 입력해주세요." }, { status: 400 });
  }

  try {
    const result = await withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        const administration = await tx.spaceAdministration.findUnique({
          where: { id: SPACE_ID },
          select: { spaceAdminUserId: true },
        });
        if (!administration || administration.spaceAdminUserId !== access.userId) {
          throw new Error("CURRENT_ADMIN_CHANGED");
        }

        const nextAdmin = await tx.user.findUnique({
          where: { email },
          select: { id: true, name: true, email: true, role: true },
        });
        if (!nextAdmin) throw new Error("USER_NOT_FOUND");
        if (nextAdmin.id === access.userId) throw new Error("SAME_USER");
        if (nextAdmin.role === "admin") throw new Error("DEVELOPER_ADMIN");

        await tx.user.update({
          where: { id: access.userId },
          data: { role: "member" },
        });
        await tx.user.update({
          where: { id: nextAdmin.id },
          data: { role: "space_admin" },
        });
        await tx.spaceAdministration.update({
          where: { id: SPACE_ID },
          data: { spaceAdminUserId: nextAdmin.id },
        });
        await tx.spaceAdminTransferLog.create({
          data: {
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
    return NextResponse.json({ error: message }, { status });
  }
}
