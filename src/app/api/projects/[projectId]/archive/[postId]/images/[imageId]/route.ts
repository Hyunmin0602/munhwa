import { NextRequest, NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { del, get } from "@vercel/blob";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbReadRetry, withDbWrite } from "@/lib/db-retry";
import { assertProjectEditor, assertProjectMember, canManageProject, recordActivity } from "@/lib/server-utils";

export const runtime = "nodejs";

type Params = { params: Promise<{ projectId: string; postId: string; imageId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { projectId, postId, imageId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await assertProjectMember(session.user.id, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const image = await withDbReadRetry(() => prisma.archiveImage.findFirst({ where: { id: imageId, postId, post: { projectId } }, select: { storageKey: true, url: true, mimeType: true } }));
  if (!image) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (image.url.startsWith("/uploads/")) return NextResponse.redirect(new URL(image.url, request.url));
  try {
    const result = await get(image.storageKey, { access: "private", token: process.env.BLOB_READ_WRITE_TOKEN });
    if (!result || result.statusCode === 304 || !result.stream) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new Response(result.stream, { headers: { "Content-Type": result.blob.contentType ?? image.mimeType, "Cache-Control": "private, max-age=3600" } });
  } catch (error) {
    console.error("[archive-images] private blob read failed", error);
    return NextResponse.json({ error: "이미지를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: Params) {
  const { projectId, postId, imageId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await assertProjectEditor(session.user.id, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await assertProjectMember(session.user.id, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [image, canManage] = await withDbReadRetry(() => Promise.all([
    prisma.archiveImage.findFirst({
      where: { id: imageId, postId, post: { projectId } },
      select: { id: true, url: true, uploaderId: true, mimeType: true, byteSize: true, post: { select: { collaborators: { select: { userId: true } } } } },
    }),
    canManageProject(session.user.id, projectId),
  ]));
  if (!image) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isCollaborator = image.post.collaborators.some(({ userId }) => userId === session.user.id);
  if (!canManage && image.uploaderId !== session.user.id && !isCollaborator) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!process.env.BLOB_READ_WRITE_TOKEN && !image.url.startsWith("/uploads/")) return NextResponse.json({ error: "이미지 저장소가 아직 설정되지 않았습니다." }, { status: 503 });

  try {
    if (process.env.BLOB_READ_WRITE_TOKEN) await del(image.url);
    else await unlink(path.join(process.cwd(), "public", image.url.replace(/^\//, ""))).catch(() => {});
    await withDbWrite(() => prisma.archiveImage.delete({ where: { id: image.id } }));
    await recordActivity({ actorId: session.user.id, projectId, type: "문서", action: "이미지 삭제", entityType: "ARCHIVE_IMAGE", entityId: image.id, title: "아카이브 이미지 삭제", beforeData: { postId, mimeType: image.mimeType, byteSize: image.byteSize } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[archive-images] delete failed", error);
    return NextResponse.json({ error: "이미지 삭제에 실패했습니다." }, { status: 500 });
  }
}
