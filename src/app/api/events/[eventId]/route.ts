import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";
import { assertAdmin, assertProjectMember, assertSpaceManager } from "@/lib/server-utils";

type Params = { params: Promise<{ eventId: string }> };

export async function DELETE(_: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const { eventId } = await params;
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { creatorId: true, scope: true, spaceId: true, projectId: true } });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const canManage = event.creatorId === userId
    || await assertAdmin(userId)
    || (event.projectId ? await assertProjectMember(userId, event.projectId) : await assertSpaceManager(userId, event.spaceId));
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await withDbRetry(() => prisma.event.delete({ where: { id: eventId } }));
  return NextResponse.json({ ok: true });
}
