import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 공개 엔드포인트 - 로그인 없이 외부에서 접근 가능
export async function GET(
  _: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const post = await prisma.archivePost.findUnique({
    where: { slug },
    include: { author: { select: { name: true } }, project: { select: { name: true } } },
  });

  if (!post || !post.published) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(post);
}
