import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projects = await withDbRetry(
    () => prisma.project.findMany({
      where: { sharingMode: "PUBLIC" },
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