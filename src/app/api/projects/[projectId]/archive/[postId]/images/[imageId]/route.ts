import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbReadRetry, withDbWrite } from "@/lib/db-retry";
import { recordActivity } from "@/lib/server-utils";
import { getArchiveAccess } from "@/lib/archive-access";
import { archiveImageResponse, isLocalArchiveImage, removeLocalArchiveImage } from "@/lib/archive-image-storage";
import { forbidden, internalError, notFound, unauthorized } from "@/lib/api-error";

export const runtime = "nodejs";
type Params = { params: Promise<{ projectId: string; postId: string; imageId: string }> };

export async function GET(_: NextRequest, { params }: Params) {
  try {
    const { projectId, postId, imageId } = await params;
    const session = await auth();
    if (!session?.user?.id) return unauthorized();
    const access = await getArchiveAccess(session.user.id, projectId, postId);
    if (!access?.canRead) return forbidden();
    const image = await withDbReadRetry(() => prisma.archiveImage.findFirst({
      where: { id: imageId, postId, post: { projectId } }, select: { storageKey: true, url: true, mimeType: true },
    }));
    if (!image) return notFound();
    return await archiveImageResponse(image) ?? notFound();
  } catch (error) {
    console.error("[archive-images] read failed", error);
    return internalError("이미지를 불러오지 못했습니다.");
  }
}

export async function DELETE(_: NextRequest, { params }: Params) {
  try {
    const { projectId, postId, imageId } = await params;
    const session = await auth();
    if (!session?.user?.id) return unauthorized();
    const access = await getArchiveAccess(session.user.id, projectId, postId);
    if (!access?.canRead || !access.canEditProject) return forbidden();
    const image = await withDbReadRetry(() => prisma.archiveImage.findFirst({
      where: { id: imageId, postId, post: { projectId } },
      select: { id: true, storageKey: true, url: true, uploaderId: true, mimeType: true, byteSize: true, post: { select: { collaborators: { select: { userId: true } } } } },
    }));
    if (!image) return notFound();
    const collaborator = image.post.collaborators.some(({ userId }) => userId === session.user.id);
    if (!access.canManage && image.uploaderId !== session.user.id && !collaborator) return forbidden();
    if (isLocalArchiveImage(image.url)) await removeLocalArchiveImage(image.storageKey, image.url);
    else await del(image.url);
    await withDbWrite(() => prisma.archiveImage.delete({ where: { id: image.id } }));
    await recordActivity({ actorId: session.user.id, projectId, type: "문서", action: "이미지 삭제", entityType: "ARCHIVE_IMAGE", entityId: image.id, title: "아카이브 이미지 삭제", beforeData: { postId, mimeType: image.mimeType, byteSize: image.byteSize } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[archive-images] delete failed", error);
    return internalError("이미지 삭제에 실패했습니다.");
  }
}
