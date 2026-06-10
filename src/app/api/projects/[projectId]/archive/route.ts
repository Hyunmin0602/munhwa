import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const posts = await prisma.archivePost.findMany({
    where: { projectId },
    include: { author: { select: { id: true, name: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(posts);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { title } = await req.json();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const slug = uuidv4().replace(/-/g, "").slice(0, 12);
  const post = await prisma.archivePost.create({
    data: { title, slug, projectId, authorId: userId },
    include: { author: { select: { id: true, name: true } } },
  });
  return NextResponse.json(post, { status: 201 });
}
