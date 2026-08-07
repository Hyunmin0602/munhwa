import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";
import { assertProjectMember } from "@/lib/server-utils";

function logApiError(action: string, error: unknown) {
  console.error(`[api/projects/:projectId/archive/:postId] ${action} failed`, error);
}

type Params = { params: Promise<{ projectId: string; postId: string }> };

export async function GET(_: NextRequest, { params }: Params) {
  const { postId } = await params;
  const post = await prisma.archivePost.findUnique({
    where: { id: postId },
    include: { author: { select: { id: true, name: true } } },
  });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(post);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { projectId, postId } = await params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    if (!(await assertProjectMember(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const existing = await withDbRetry(() => prisma.archivePost.findFirst({ where: { id: postId, projectId } }));
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data = await req.json();
    const post = await withDbRetry(() =>
      prisma.archivePost.update({
        where: { id: postId },
        data: {
          title: data.title,
          content: data.content,
          published: data.published,
          publishedAt: data.published ? new Date() : null,
        },
      })
    );
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

    const existing = await withDbRetry(() => prisma.archivePost.findFirst({ where: { id: postId, projectId } }));
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await withDbRetry(() => prisma.archivePost.delete({ where: { id: postId } }));
    return NextResponse.json({ ok: true });
  } catch (error) {
    logApiError("DELETE", error);
    return NextResponse.json({ error: "문서 삭제에 실패했습니다." }, { status: 500 });
  }
}
