import { NextRequest, NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";
import { del } from "@vercel/blob";
import { withDbReadRetry, withDbWrite } from "@/lib/db-retry";
import { normalizeArchiveVisibility } from "@/lib/archive-visibility";
import { partitionArchiveImageUrls } from "@/lib/archive-images";
import { assertProjectMember, recordActivity } from "@/lib/server-utils";
import { apiError, forbidden, internalError, notFound, unauthorized } from "@/lib/api-error";

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
  if (!session?.user?.id) return unauthorized();
  const userId = session.user.id;
  if (!(await assertProjectMember(userId, projectId))) return forbidden();

  const post = await withDbReadRetry(
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
  if (!post) return notFound("문서를 찾을 수 없습니다.");
  return NextResponse.json(post);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { projectId, postId } = await params;
    const session = await auth();
    if (!session?.user?.id) return unauthorized();
    const userId = session.user.id;

    if (!(await assertProjectMember(userId, projectId))) return forbidden();

    const existing = await withDbReadRetry(() => prisma.archivePost.findFirst({
      where: { id: postId, projectId },
      include: { collaborators: { select: { userId: true } } },
    }));
    if (!existing) return notFound("문서를 찾을 수 없습니다.");

    const data = await req.json();
    if (typeof data.expectedUpdatedAt === "string" && existing.updatedAt.toISOString() !== data.expectedUpdatedAt) {
      return apiError("CONFLICT", "다른 사용자가 문서를 먼저 수정했습니다. 최신 내용을 불러온 뒤 다시 저장해주세요.", 409);
    }
    if (data.shareAction === "revoke") {
      const post = await withDbWrite(() =>
        prisma.archivePost.update({ where: { id: postId }, data: { shareEnabled: false } })
      );
      await recordActivity({ actorId: userId, projectId, type: "문서", action: "공유 해제", entityType: "ARCHIVE_POST", entityId: postId, title: existing.title });
      return NextResponse.json(post);
    }
    if (data.shareAction === "regenerate") {
      const post = await withDbWrite(() =>
        prisma.archivePost.update({
          where: { id: postId },
          data: { shareEnabled: true, shareToken: uuidv4().replace(/-/g, "") },
        })
      );
      await recordActivity({ actorId: userId, projectId, type: "문서", action: "공유 설정", entityType: "ARCHIVE_POST", entityId: postId, title: existing.title });
      return NextResponse.json(post);
    }
    const nextVisibility = normalizeArchiveVisibility(data.visibility ?? (data.published !== undefined ? (data.published ? "EXTERNAL" : "PRIVATE") : existing.visibility));
    const post = await withDbWrite(() =>
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
    return internalError("문서 수정에 실패했습니다.");
  }
}

export async function DELETE(_: NextRequest, { params }: Params) {
  try {
    const { projectId, postId } = await params;
    const session = await auth();
    if (!session?.user?.id) return unauthorized();
    const userId = session.user.id;

    if (!(await assertProjectMember(userId, projectId))) return forbidden();

    const existing = await withDbReadRetry(() => prisma.archivePost.findFirst({ where: { id: postId, projectId } }));
    if (!existing) return notFound("문서를 찾을 수 없습니다.");

    const images = await withDbReadRetry(() => prisma.archiveImage.findMany({ where: { postId }, select: { url: true } }));
    const { localImageUrls, blobImageUrls } = partitionArchiveImageUrls(images.map((img) => img.url));

    // Clean up local images from disk
    for (const url of localImageUrls) {
      const filePath = path.join(process.cwd(), "public", url.replace(/^\//, ""));
      await unlink(filePath).catch(() => {});
    }

    // Best-effort cleanup of remote blob images
    if (blobImageUrls.length > 0 && process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        await del(blobImageUrls);
      } catch (blobError) {
        console.warn("[archive:delete] blob image deletion warning", blobError);
      }
    }

    await withDbWrite(async () => {
      await prisma.archivePostCollaborator.deleteMany({ where: { postId } });
      await prisma.archiveImage.deleteMany({ where: { postId } });
      await prisma.archivePost.delete({ where: { id: postId } });
    });

    await recordActivity({
      actorId: userId,
      projectId,
      type: "문서",
      action: "삭제",
      entityType: "ARCHIVE_POST",
      entityId: postId,
      title: existing.title,
      beforeData: { title: existing.title, content: existing.content, kind: existing.kind, visibility: existing.visibility },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logApiError("DELETE", error);
    return internalError("문서 삭제에 실패했습니다.");
  }
}
