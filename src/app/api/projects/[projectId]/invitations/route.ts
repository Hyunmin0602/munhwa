import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { assertProjectOwner, findUserByEmail } from "@/lib/server-utils";
import { withDbRetry } from "@/lib/db-retry";

type Params = { params: Promise<{ projectId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await assertProjectOwner(session.user.id, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return NextResponse.json({ error: "초대할 사용자의 이메일이 필요합니다." }, { status: 400 });

  const invitee = await withDbRetry(() => findUserByEmail(email), { operation: "invitation:find-user" });
  if (!invitee) return NextResponse.json({ error: "가입된 사용자를 찾을 수 없습니다." }, { status: 404 });
  if (invitee.id === session.user.id) return NextResponse.json({ error: "본인은 초대할 수 없습니다." }, { status: 400 });

  const member = await withDbRetry(() => prisma.projectMember.findUnique({ where: { userId_projectId: { userId: invitee.id, projectId } } }), { operation: "invitation:check-member" });
  if (member) return NextResponse.json({ error: "이미 사업 참여자입니다." }, { status: 409 });

  const pending = await withDbRetry(() => prisma.projectInvitation.findFirst({ where: { projectId, inviteeId: invitee.id, status: "PENDING", expiresAt: { gt: new Date() } } }), { operation: "invitation:check-pending" });
  if (pending) return NextResponse.json({ error: "이미 대기 중인 초대가 있습니다." }, { status: 409 });

  const invitation = await withDbRetry(
    () => prisma.projectInvitation.create({ data: { projectId, inviteeId: invitee.id, invitedBy: session.user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }, include: { invitee: { select: { id: true, name: true, email: true } } } }),
    { operation: "invitation:create" }
  );
  return NextResponse.json(invitation, { status: 201 });
}