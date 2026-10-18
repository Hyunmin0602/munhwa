import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { put, del } from "@vercel/blob";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbReadRetry, withDbWrite } from "@/lib/db-retry";
import { getArchiveAccess } from "@/lib/archive-access";
import { localArchiveImagePath } from "@/lib/archive-image-storage";
import { archiveImageExtension, hasValidArchiveImageSignature, isArchiveImageMimeType, MAX_ARCHIVE_IMAGE_BYTES } from "@/lib/archive-images";
import { InputValidationError, readRequestBytes } from "@/lib/validation";
import { apiError, forbidden, internalError, unauthorized, validationError } from "@/lib/api-error";

export const runtime = "nodejs";
type Params = { params: Promise<{ projectId: string; postId: string }> };
const MAX_MULTIPART_BYTES = MAX_ARCHIVE_IMAGE_BYTES + 64 * 1024;

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return !!value && typeof value === "object" && typeof value.arrayBuffer === "function";
}

export async function GET(_: NextRequest, { params }: Params) {
  try {
    const { projectId, postId } = await params;
    const session = await auth();
    if (!session?.user?.id) return unauthorized();
    const access = await getArchiveAccess(session.user.id, projectId, postId);
    if (!access?.canRead) return forbidden();
    const images = await withDbReadRetry(() => prisma.archiveImage.findMany({
      where: { postId }, select: { id: true, mimeType: true, byteSize: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }));
    return NextResponse.json(images.map((image) => ({ ...image,
      url: `/api/projects/${projectId}/archive/${postId}/images/${image.id}`,
    })));
  } catch (error) {
    console.error("[archive-images] list failed", error);
    return internalError("첨부 이미지를 불러오지 못했습니다.");
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  let blob: Awaited<ReturnType<typeof put>> | undefined;
  let localFilePath: string | undefined;
  try {
    const { projectId, postId } = await params;
    const session = await auth();
    if (!session?.user?.id) return unauthorized();
    const access = await getArchiveAccess(session.user.id, projectId, postId);
    if (!access?.canEdit) return forbidden();
    const contentType = request.headers.get("content-type") ?? "";
    if (!/^multipart\/form-data\s*;/i.test(contentType)) return validationError("이미지 파일 요청이 필요합니다.");
    const bytes = await readRequestBytes(request, MAX_MULTIPART_BYTES);
    let formData: FormData;
    try { formData = await new Response(bytes, { headers: { "Content-Type": contentType } }).formData(); }
    catch { return validationError("올바른 이미지 파일 요청이 필요합니다."); }
    const file = formData.get("file");
    if (!isUploadFile(file) || formData.getAll("file").length !== 1) return validationError("이미지 파일 하나가 필요합니다.");
    if (!isArchiveImageMimeType(file.type)) return validationError("JPEG, PNG, WebP, GIF 파일만 업로드할 수 있습니다.");
    if (file.size === 0 || file.size > MAX_ARCHIVE_IMAGE_BYTES) return validationError("이미지는 4MB 이하만 업로드할 수 있습니다.");
    const imageBytes = new Uint8Array(await file.arrayBuffer());
    if (!hasValidArchiveImageSignature(imageBytes, file.type)) return validationError("파일 내용이 이미지 형식과 일치하지 않습니다.");

    const storageKey = `archive/${postId}/${randomUUID()}.${archiveImageExtension(file.type)}`;
    const hasBlobStorage = !!process.env.BLOB_READ_WRITE_TOKEN;
    const useLocalStorage = !hasBlobStorage && !process.env.VERCEL;
    if (!hasBlobStorage && !useLocalStorage) return apiError("INTERNAL_ERROR", "이미지 저장소를 사용할 수 없습니다.", 503);
    let imageUrl: string;
    let persistedStorageKey: string;
    if (hasBlobStorage) {
      blob = await put(storageKey, new Blob([imageBytes]), { access: "private", token: process.env.BLOB_READ_WRITE_TOKEN,
        contentType: file.type, addRandomSuffix: false });
      imageUrl = blob.url;
      persistedStorageKey = blob.pathname;
    } else {
      localFilePath = localArchiveImagePath(storageKey);
      await mkdir(path.dirname(localFilePath), { recursive: true });
      await writeFile(localFilePath, imageBytes);
      imageUrl = `local:${storageKey}`;
      persistedStorageKey = storageKey;
    }
    const image = await withDbWrite(() => prisma.archiveImage.create({
      data: { postId, uploaderId: session.user.id, storageKey: persistedStorageKey, url: imageUrl, mimeType: file.type, byteSize: file.size },
      select: { id: true, mimeType: true, byteSize: true, createdAt: true },
    }));
    return NextResponse.json({ ...image, url: `/api/projects/${projectId}/archive/${postId}/images/${image.id}` }, { status: 201 });
  } catch (error) {
    if (blob) await del(blob.url).catch(() => {});
    if (localFilePath) await unlink(localFilePath).catch(() => {});
    if (error instanceof InputValidationError) return validationError(error.message);
    console.error("[archive-images] upload failed", error);
    return internalError("이미지 업로드에 실패했습니다. 잠시 후 다시 시도해주세요.");
  }
}
