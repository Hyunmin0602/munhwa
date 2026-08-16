import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";

type Params = { params: Promise<{ invitationId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { invitationId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const action = body.action === "accept" || body.action === "decline" ? body.action : null;
  if (!action) return NextResponse.json({ error: "수락 또는 거절만 가능합니다." }, { status: 400 });

  const invitation = await withDbRetry(() => prisma.projectInvitation.findUnique({ where: { id: invitationId } }), { operation: "invitation:find" });
  if (!invitation || invitation.inviteeId !== session.user.id) return NextResponse.json({ error: "초대를 찾을 수 없습니다." }, { status: 404 });
  if (invitation.status !== "PENDING") return NextResponse.json({ error: "이미 처리된 초대입니다." }, { status: 409 });
  if (invitation.expiresAt <= new Date()) return NextResponse.json({ error: "만료된 초대입니다." }, { status: 410 });

  try {
    const result = await withDbRetry(
      () => prisma.$transaction(async (tx) => {
        const updated = await tx.projectInvitation.update({ where: { id: invitationId, status: "PENDING" }, data: { status: action === "accept" ? "ACCEPTED" : "DECLINED", respondedAt: new Date() } });
        if (action === "accept") {
          await tx.projectMember.create({ data: { projectId: invitation.projectId, userId: session.user.id, role: "member" } });
        }
        return updated;
      }),
      { operation: "invitation:respond" }
    );
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "초대 처리 중 상태가 변경되었습니다. 다시 시도해주세요." }, { status: 409 });
  }
}