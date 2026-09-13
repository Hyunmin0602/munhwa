import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";
import { assertProjectMember, canManageCultureSportsContent } from "@/lib/server-utils";

export const runtime = "nodejs";

type Params = { params: Promise<{ projectId: string; postId: string; imageId: string }> };

export async function DELETE(_: NextRequest, { params }: Params) {
  const { projectId, postId, imageId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await assertProjectMember(session.user.id, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [image, canManage] = await withDbRetry(() => Promise.all([
    prisma.archiveImage.findFirst({ where: { id: imageId, postId, post: { projectId } } }),
    canManageCultureSportsContent(session.user.id),
  ]));
  if (!image) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canManage && image.uploaderId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "이미지 저장소가 아직 설정되지 않았습니다." }, { status: 503 });

  try {
    await del(image.url);
    await withDbRetry(() => prisma.archiveImage.delete({ where: { id: image.id } }));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[archive-images] delete failed", error);
    return NextResponse.json({ error: "이미지 삭제에 실패했습니다." }, { status: 500 });
  }
}
