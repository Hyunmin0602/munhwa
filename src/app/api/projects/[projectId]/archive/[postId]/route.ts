import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";
import { withDbRetry } from "@/lib/db-retry";
import { normalizeArchiveVisibility } from "@/lib/archive-visibility";
import { assertProjectMember, canViewAllProjects } from "@/lib/server-utils";

function logApiError(action: string, error: unknown) {
  console.error(`[api/projects/:projectId/archive/:postId] ${action} failed`, error);
}

type Params = { params: Promise<{ projectId: string; postId: string }> };

function normalizeArchiveKind(value: unknown) {
  return value === "MEETING" ? "MEETING" : "DOCUMENT";
}

export async function GET(_: NextRequest, { params }: Params) {
  const { projectId, postId } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  if (!(await assertProjectMember(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const canViewAll = await canViewAllProjects(userId);

  const post = await withDbRetry(
    () =>
      prisma.archivePost.findFirst({
        where: { id: postId, projectId },
        include: { author: { select: { id: true, name: true } } },
      }),
    { operation: `archive:get:${postId}` }
  );
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canViewAll && post.visibility === "PRIVATE" && post.authorId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(post);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { projectId, postId } = await params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    if (!(await assertProjectMember(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const existing = await withDbRetry(() => prisma.archivePost.findFirst({ where: { id: postId, projectId } }));
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.visibility === "PRIVATE" && existing.authorId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data = await req.json();
    if (existing.visibility === "EXTERNAL" && existing.authorId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (data.shareAction === "revoke") {
      const post = await withDbRetry(() =>
        prisma.archivePost.update({ where: { id: postId }, data: { shareEnabled: false } })
      );
      return NextResponse.json(post);
    }
    if (data.shareAction === "regenerate") {
      const post = await withDbRetry(() =>
        prisma.archivePost.update({
          where: { id: postId },
          data: { shareEnabled: true, shareToken: uuidv4().replace(/-/g, "") },
        })
      );
      return NextResponse.json(post);
    }
    const nextVisibility = normalizeArchiveVisibility(data.visibility ?? (data.published !== undefined ? (data.published ? "EXTERNAL" : "PRIVATE") : undefined));
    const post = await withDbRetry(() =>
      prisma.archivePost.update({
        where: { id: postId },
        data: {
          title: data.title,
          content: data.content,
          kind: normalizeArchiveKind(data.kind ?? existing.kind),
          visibility: nextVisibility,
          shareEnabled: nextVisibility === "EXTERNAL",
          shareToken: nextVisibility === "EXTERNAL" ? (existing.shareToken ?? uuidv4().replace(/-/g, "")) : null,
          published: nextVisibility === "EXTERNAL",
          publishedAt: nextVisibility === "EXTERNAL" ? (existing.publishedAt ?? new Date()) : null,
        },
      })
    );
    return NextResponse.json(post);
  } catch (error) {
    logApiError("PATCH", error);
    return NextResponse.json({ error: "문서 수정에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: Params) {
  try {
    const { projectId, postId } = await params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    if (!(await assertProjectMember(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const existing = await withDbRetry(() => prisma.archivePost.findFirst({ where: { id: postId, projectId } }));
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if ((existing.visibility === "PRIVATE" || existing.visibility === "EXTERNAL") && existing.authorId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await withDbRetry(() => prisma.archivePost.delete({ where: { id: postId } }));
    return NextResponse.json({ ok: true });
  } catch (error) {
    logApiError("DELETE", error);
    return NextResponse.json({ error: "문서 삭제에 실패했습니다." }, { status: 500 });
  }
}
