import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const posts = await withDbRetry(() =>
    prisma.archivePost.findMany({
      where: {
        kind: "MEETING",
        project: { members: { some: { userId } } },
        OR: [
          { authorId: userId },
          { visibility: { not: "PRIVATE" } },
        ],
      },
      select: {
        id: true,
        title: true,
        visibility: true,
        updatedAt: true,
        author: { select: { name: true } },
        project: { select: { id: true, name: true, color: true } },
      },
      orderBy: { updatedAt: "desc" },
    })
  );

  return NextResponse.json(posts);
}