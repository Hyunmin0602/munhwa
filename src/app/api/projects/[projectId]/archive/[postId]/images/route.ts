import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";
import { assertProjectMember, canManageCultureSportsContent } from "@/lib/server-utils";
import { archiveImageExtension, hasValidArchiveImageSignature, isArchiveImageMimeType, MAX_ARCHIVE_IMAGE_BYTES } from "@/lib/archive-images";

export const runtime = "nodejs";

type Params = { params: Promise<{ projectId: string; postId: string }> };

async function canEditArchiveImage(userId: string, projectId: string, postId: string) {
  if (!(await assertProjectMember(userId, projectId))) return false;
  const [post, canManage] = await withDbRetry(() => Promise.all([
    prisma.archivePost.findFirst({ where: { id: postId, projectId }, select: { authorId: true, visibility: true, collaborators: { select: { userId: true } } } }),
    canManageCultureSportsContent(userId),
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
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "이미지 저장소가 아직 설정되지 않았습니다." }, { status: 503 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "이미지 파일이 필요합니다." }, { status: 400 });
  if (!isArchiveImageMimeType(file.type)) return NextResponse.json({ error: "JPEG, PNG, WebP, GIF 파일만 업로드할 수 있습니다." }, { status: 400 });
  if (file.size === 0 || file.size > MAX_ARCHIVE_IMAGE_BYTES) return NextResponse.json({ error: "이미지는 4MB 이하만 업로드할 수 있습니다." }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasValidArchiveImageSignature(bytes, file.type)) {
    return NextResponse.json({ error: "파일 내용이 이미지 형식과 일치하지 않습니다." }, { status: 400 });
  }

  const storageKey = `archive/${postId}/${crypto.randomUUID()}.${archiveImageExtension(file.type)}`;
  let blob: Awaited<ReturnType<typeof put>> | undefined;
  try {
    const uploadedBlob = await put(storageKey, file, { access: "public", contentType: file.type, addRandomSuffix: false });
    blob = uploadedBlob;
    const image = await withDbRetry(() => prisma.archiveImage.create({
      data: { postId, uploaderId: session.user.id, storageKey: uploadedBlob.pathname, url: uploadedBlob.url, mimeType: file.type, byteSize: file.size },
    }));
    return NextResponse.json(image, { status: 201 });
  } catch (error) {
    if (blob) await del(blob.url).catch(() => {});
    console.error("[archive-images] upload failed", error);
    return NextResponse.json({ error: "이미지 업로드에 실패했습니다." }, { status: 500 });
  }
}
