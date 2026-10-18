import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbReadRetry, withDbRetry } from "@/lib/db-retry";
import { DEFAULT_SPACE_ID, assertAdmin, assertSpaceManager } from "@/lib/server-utils";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const canViewAll = await assertAdmin(userId);
  const canViewSpace = !canViewAll && await assertSpaceManager(userId, DEFAULT_SPACE_ID);
  const spaceMemberships = canViewAll || canViewSpace
    ? []
    : await withDbReadRetry(() => prisma.spaceMember.findMany({ where: { userId }, select: { spaceId: true } }));
  const spaceIds = spaceMemberships.map((membership) => membership.spaceId);

  const projects = await withDbRetry(
    () => prisma.project.findMany({
      where: {
        sharingMode: "PUBLIC",
        ...(canViewAll || canViewSpace ? {} : {
          OR: [
            { isArchived: false },
            { ownerId: userId },
            { members: { some: { userId } } },
            ...(spaceIds.length ? [{ isArchived: true, accessScope: "SPACE", spaceId: { in: spaceIds } }] : []),
          ],
        }),
      },
      select: {
        id: true,
        name: true,
        summary: true,
        status: true,
        _count: { select: { members: true } },
      },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    }),
    { operation: "projects:summary" }
  );

  return NextResponse.json(projects.map(({ _count, ...project }) => ({ ...project, memberCount: _count.members })));
}
