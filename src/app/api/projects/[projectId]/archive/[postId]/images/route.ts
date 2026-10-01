import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { put, del } from "@vercel/blob";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";
import { assertProjectMember, canManageProject } from "@/lib/server-utils";
import { archiveImageExtension, hasValidArchiveImageSignature, isArchiveImageMimeType, MAX_ARCHIVE_IMAGE_BYTES } from "@/lib/archive-images";

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
  const [post, canManage] = await withDbRetry(() => Promise.all([
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
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditArchiveImage(session.user.id, projectId, postId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const images = await withDbRetry(() => prisma.archiveImage.findMany({
    where: { postId },
    select: { id: true, storageKey: true, url: true, mimeType: true, byteSize: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  }));
  return NextResponse.json(images);
}

export async function POST(request: NextRequest, { params }: Params) {
  const { projectId, postId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditArchiveImage(session.user.id, projectId, postId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const formData = await request.formData();
  const file = formData.get("file");
  if (!isUploadFile(file)) return NextResponse.json({ error: "이미지 파일이 필요합니다." }, { status: 400 });
  if (!isArchiveImageMimeType(file.type)) return NextResponse.json({ error: "JPEG, PNG, WebP, GIF 파일만 업로드할 수 있습니다." }, { status: 400 });
  if (file.size === 0 || file.size > MAX_ARCHIVE_IMAGE_BYTES) return NextResponse.json({ error: "이미지는 4MB 이하만 업로드할 수 있습니다." }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasValidArchiveImageSignature(bytes, file.type)) {
    return NextResponse.json({ error: "파일 내용이 이미지 형식과 일치하지 않습니다." }, { status: 400 });
  }

  const storageKey = `archive/${postId}/${randomUUID()}.${archiveImageExtension(file.type)}`;
  const hasBlobStorage = !!process.env.BLOB_READ_WRITE_TOKEN;
  const useLocalStorage = !hasBlobStorage && !process.env.VERCEL;
  if (!hasBlobStorage && !useLocalStorage) {
    return NextResponse.json({ error: "이미지 저장소가 아직 설정되지 않았습니다. BLOB_READ_WRITE_TOKEN을 설정해주세요." }, { status: 503 });
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
      const uploadedBlob = await put(storageKey, uploadBody, { access: "public", token: process.env.BLOB_READ_WRITE_TOKEN, contentType: file.type, addRandomSuffix: false });
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
    const image = await withDbRetry(() => prisma.archiveImage.create({
      data: { postId, uploaderId: session.user.id, storageKey: persistedStorageKey, url: imageUrl, mimeType: file.type, byteSize: file.size },
    }));
    return NextResponse.json(image, { status: 201 });
  } catch (error) {
    if (blob) await del(blob.url).catch(() => {});
    if (localFilePath) await unlink(localFilePath).catch(() => {});
    const reason = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error("[archive-images] upload failed", { stage: uploadStage, reason, postId });
    return NextResponse.json({ error: `${uploadStage} 단계에서 이미지 업로드에 실패했습니다.` }, { status: 500 });
  }
}
