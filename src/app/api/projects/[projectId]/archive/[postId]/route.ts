import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";
import { del } from "@vercel/blob";
import { withDbRetry } from "@/lib/db-retry";
import { normalizeArchiveVisibility } from "@/lib/archive-visibility";
import { assertProjectMember, canManageProject, canViewAllArchivePosts, recordActivity } from "@/lib/server-utils";

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
  const canViewAll = await canViewAllArchivePosts(userId, projectId);

  const post = await withDbRetry(
    () =>
      prisma.archivePost.findFirst({
        where: { id: postId, projectId },
        include: {
          author: { select: { id: true, name: true } },
          collaborators: { select: { user: { select: { id: true, name: true, email: true } } } },
        },
      }),
    { operation: `archive:get:${postId}` }
  );
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isCollaborator = post.collaborators.some(({ user }) => user.id === userId);
  if (!canViewAll && post.visibility === "PRIVATE" && post.authorId !== userId && !isCollaborator) {
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
    const canManage = await canManageProject(userId, projectId);

    const existing = await withDbRetry(() => prisma.archivePost.findFirst({
      where: { id: postId, projectId },
      include: { collaborators: { select: { userId: true } } },
    }));
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const isCollaborator = existing.collaborators.some(({ userId: collaboratorId }) => collaboratorId === userId);
    if (!canManage && existing.visibility === "PRIVATE" && existing.authorId !== userId && !isCollaborator) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data = await req.json();
    if (typeof data.expectedUpdatedAt === "string" && existing.updatedAt.toISOString() !== data.expectedUpdatedAt) {
      return NextResponse.json({ error: "다른 사용자가 문서를 먼저 수정했습니다. 최신 내용을 불러온 뒤 다시 저장해주세요." }, { status: 409 });
    }
    if (!canManage && existing.visibility === "EXTERNAL" && existing.authorId !== userId && !isCollaborator) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (data.shareAction === "revoke") {
      const post = await withDbRetry(() =>
        prisma.archivePost.update({ where: { id: postId }, data: { shareEnabled: false } })
      );
      await recordActivity({ actorId: userId, projectId, type: "문서", action: "공유 해제", entityType: "ARCHIVE_POST", entityId: postId, title: existing.title });
      return NextResponse.json(post);
    }
    if (data.shareAction === "regenerate") {
      const post = await withDbRetry(() =>
        prisma.archivePost.update({
          where: { id: postId },
          data: { shareEnabled: true, shareToken: uuidv4().replace(/-/g, "") },
        })
      );
      await recordActivity({ actorId: userId, projectId, type: "문서", action: "공유 설정", entityType: "ARCHIVE_POST", entityId: postId, title: existing.title });
      return NextResponse.json(post);
    }
    const nextVisibility = normalizeArchiveVisibility(data.visibility ?? (data.published !== undefined ? (data.published ? "EXTERNAL" : "PRIVATE") : existing.visibility));
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
    await recordActivity({ actorId: userId, projectId, type: "문서", action: "수정", entityType: "ARCHIVE_POST", entityId: post.id, title: post.title, beforeData: { title: existing.title, content: existing.content, kind: existing.kind, visibility: existing.visibility }, afterData: { title: post.title, content: post.content, kind: post.kind, visibility: post.visibility } });
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
    const canManage = await canManageProject(userId, projectId);

    const existing = await withDbRetry(() => prisma.archivePost.findFirst({ where: { id: postId, projectId } }));
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canManage && (existing.visibility === "PRIVATE" || existing.visibility === "EXTERNAL") && existing.authorId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const images = await withDbRetry(() => prisma.archiveImage.findMany({ where: { postId }, select: { url: true } }));
    if (images.length > 0 && !process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: "이미지 저장소 설정이 없어 첨부 이미지를 안전하게 삭제할 수 없습니다." }, { status: 503 });
    }
    if (images.length > 0) await del(images.map((image) => image.url));
    await withDbRetry(() => prisma.archivePost.delete({ where: { id: postId } }));
    await recordActivity({ actorId: userId, projectId, type: "문서", action: "삭제", entityType: "ARCHIVE_POST", entityId: postId, title: existing.title, beforeData: { title: existing.title, content: existing.content, kind: existing.kind, visibility: existing.visibility } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logApiError("DELETE", error);
    return NextResponse.json({ error: "문서 삭제에 실패했습니다." }, { status: 500 });
  }
}
