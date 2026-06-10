import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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
  const { postId } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  const post = await prisma.archivePost.update({
    where: { id: postId },
    data: {
      title: data.title,
      content: data.content,
      published: data.published,
      publishedAt: data.published ? new Date() : null,
    },
  });
  return NextResponse.json(post);
}

export async function DELETE(_: NextRequest, { params }: Params) {
  const { postId } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.archivePost.delete({ where: { id: postId } });
  return NextResponse.json({ ok: true });
}
