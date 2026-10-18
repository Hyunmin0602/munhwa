import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbReadRetry } from "@/lib/db-retry";
import { getArchiveAccess } from "@/lib/archive-access";
import { archiveImageResponse, localArchiveImagePath } from "@/lib/archive-image-storage";
import { forbidden, internalError, notFound, unauthorized } from "@/lib/api-error";

export const runtime = "nodejs";

// Legacy markdown URLs are rewritten here, before Next.js can serve public/uploads.
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return unauthorized();
    const key = request.nextUrl.searchParams.get("key") ?? "";
    try { localArchiveImagePath(key); } catch { return notFound(); }
    const image = await withDbReadRetry(() => prisma.archiveImage.findUnique({ where: { storageKey: key },
      select: { storageKey: true, url: true, mimeType: true, post: { select: { id: true, projectId: true } } },
    }));
    if (!image) return notFound();
    const access = await getArchiveAccess(session.user.id, image.post.projectId, image.post.id);
    if (!access?.canRead) return forbidden();
    return await archiveImageResponse(image) ?? notFound();
  } catch (error) {
    console.error("[archive-images] legacy read failed", error);
    return internalError("이미지를 불러오지 못했습니다.");
  }
}
