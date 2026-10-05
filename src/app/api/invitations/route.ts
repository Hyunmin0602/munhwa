import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const invitations = await withDbRetry(
    () => prisma.projectInvitation.findMany({ where: { inviteeId: session.user.id }, include: { project: { select: { id: true, name: true, summary: true } }, sender: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } }),
    { operation: "invitations:list" }
  );
  return NextResponse.json(invitations);
}