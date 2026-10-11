import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { put, del } from "@vercel/blob";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbReadRetry, withDbWrite } from "@/lib/db-retry";
import { assertProjectEditor, assertProjectMember, canManageProject, recordActivity } from "@/lib/server-utils";
import { archiveImageExtension, hasValidArchiveImageSignature, isArchiveImageMimeType, MAX_ARCHIVE_IMAGE_BYTES } from "@/lib/archive-images";
import { apiError, forbidden, internalError, notFound, unauthorized, validationError } from "@/lib/api-error";

export const runtime = "nodejs";

type Params = { params: Promise<{ projectId: string; postId: string }> };
function isUploadFile(value: FormDataEntryValue | null): value is File {
  return !!value
    && typeof value === "object"
    && typeof (value as Partial<File>).type === "string"
    && typeof (value as Partial<File>).size === "number"
    && typeof (value as Partial<File>).arrayBuffer === "function";
}

function localImagePath(storageKey: string) {
  return path.join(process.cwd(), "public", "uploads", storageKey);
}

async function canEditArchiveImage(userId: string, projectId: string, postId: string) {
  if (!(await assertProjectMember(userId, projectId))) return false;
  const [post, canManage] = await withDbReadRetry(() => Promise.all([
    prisma.archivePost.findFirst({ where: { id: postId, projectId }, select: { authorId: true, visibility: true, collaborators: { select: { userId: true } } } }),
    canManageProject(userId, projectId),
  ]));
  if (!post) return false;
  if (canManage) return true;
  if (post.visibility === "PRIVATE" || post.visibility === "EXTERNAL") return post.authorId === userId || post.collaborators.some(({ userId: collaboratorId }) => collaboratorId === userId);
  return true;
}

export async function GET(_: NextRequest, { params }: Params) {
  const { projectId, postId } = await params;
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  if (!(await assertProjectMember(session.user.id, projectId))) return forbidden();
  const post = await withDbReadRetry(() => prisma.archivePost.findFirst({ where: { id: postId, projectId }, select: { id: true } }));
  if (!post) return notFound();

  const images = await withDbReadRetry(() => prisma.archiveImage.findMany({
    where: { postId },
    select: { id: true, storageKey: true, url: true, mimeType: true, byteSize: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  }));
  return NextResponse.json(images.map((image) => ({
    ...image,
    url: image.url.startsWith("/uploads/") ? image.url : `/api/projects/${projectId}/archive/${postId}/images/${image.id}`,
  })));
}

export async function POST(request: NextRequest, { params }: Params) {
  const { projectId, postId } = await params;
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  if (!(await assertProjectEditor(session.user.id, projectId))) return forbidden();
  if (!(await canEditArchiveImage(session.user.id, projectId, postId))) return forbidden();
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return validationError("올바른 이미지 업로드 요청이 아닙니다.");
  }
  const file = formData.get("file");
  if (!isUploadFile(file)) return validationError("이미지 파일이 필요합니다.");
  if (!isArchiveImageMimeType(file.type)) return validationError("JPEG, PNG, WebP, GIF 파일만 업로드할 수 있습니다.");
  if (file.size === 0 || file.size > MAX_ARCHIVE_IMAGE_BYTES) return validationError("이미지는 4MB 이하만 업로드할 수 있습니다.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasValidArchiveImageSignature(bytes, file.type)) {
    return validationError("파일 내용이 이미지 형식과 일치하지 않습니다.");
  }

  const storageKey = `archive/${postId}/${randomUUID()}.${archiveImageExtension(file.type)}`;
  const hasBlobStorage = !!process.env.BLOB_READ_WRITE_TOKEN;
  const useLocalStorage = !hasBlobStorage && !process.env.VERCEL;
  if (!hasBlobStorage && !useLocalStorage) {
    return apiError("INTERNAL_ERROR", "이미지 저장소를 사용할 수 없습니다. 관리자에게 문의해주세요.", 503);
  }
  let blob: Awaited<ReturnType<typeof put>> | undefined;
  let localFilePath: string | undefined;
  let uploadStage = "저장 준비";
  try {
    let imageUrl: string;
    let persistedStorageKey: string;
    if (hasBlobStorage) {
      uploadStage = "Blob 업로드";
      const uploadBody = new Blob([bytes], { type: file.type });
      const uploadedBlob = await put(storageKey, uploadBody, { access: "private", token: process.env.BLOB_READ_WRITE_TOKEN, contentType: file.type, addRandomSuffix: false });
      blob = uploadedBlob;
      imageUrl = uploadedBlob.url;
      persistedStorageKey = uploadedBlob.pathname;
    } else {
      uploadStage = "로컬 파일 저장";
      localFilePath = localImagePath(storageKey);
      await mkdir(path.dirname(localFilePath), { recursive: true });
      await writeFile(localFilePath, bytes);
      imageUrl = `/uploads/${storageKey}`;
      persistedStorageKey = storageKey;
    }
    uploadStage = "데이터베이스 기록";
    const image = await withDbWrite(() => prisma.archiveImage.create({
      data: { postId, uploaderId: session.user.id, storageKey: persistedStorageKey, url: imageUrl, mimeType: file.type, byteSize: file.size },
    }));
    await recordActivity({ actorId: session.user.id, projectId, type: "문서", action: "이미지 업로드", entityType: "ARCHIVE_IMAGE", entityId: image.id, title: "아카이브 이미지 업로드", afterData: { postId, mimeType: image.mimeType, byteSize: image.byteSize } });
    return NextResponse.json({ ...image, url: `/api/projects/${projectId}/archive/${postId}/images/${image.id}` }, { status: 201 });
  } catch (error) {
    if (blob) await del(blob.url).catch(() => {});
    if (localFilePath) await unlink(localFilePath).catch(() => {});
    const reason = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error("[archive-images] upload failed", { stage: uploadStage, reason, postId });
    return internalError("이미지 업로드에 실패했습니다. 잠시 후 다시 시도해주세요.");
  }
}
