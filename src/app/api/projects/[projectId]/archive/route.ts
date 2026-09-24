import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";
import { withDbReadRetry, withDbWrite } from "@/lib/db-retry";
import { assertProjectMember, canViewAllArchivePosts } from "@/lib/server-utils";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  if (!(await assertProjectMember(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const canViewAll = await canViewAllArchivePosts(userId, projectId);

  const requestedLimit = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 30, 1), 50);
  const cursor = request.nextUrl.searchParams.get("cursor");
  const posts = await withDbReadRetry(() =>
    prisma.archivePost.findMany({
      where: {
        projectId,
        ...(canViewAll ? {} : { OR: [{ authorId: userId }, { visibility: { not: "PRIVATE" } }] }),
      },
      select: {
        id: true,
        title: true,
        content: true,
        slug: true,
        kind: true,
        visibility: true,
        shareEnabled: true,
        published: true,
        publishedAt: true,
        projectId: true,
        author: { select: { id: true, name: true } },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit + 1,
    })
  );
  const hasMore = posts.length > limit;
  const items = posts.slice(0, limit);
  return NextResponse.json({ items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  if (!(await assertProjectMember(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { title } = await req.json();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const slug = uuidv4().replace(/-/g, "").slice(0, 12);
  const post = await withDbWrite(() =>
    prisma.archivePost.create({
      data: { title, slug, projectId, authorId: userId, visibility: "PRIVATE", published: false },
      include: { author: { select: { id: true, name: true } } },
    })
  );
  return NextResponse.json(post, { status: 201 });
}
