import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const events = await prisma.event.findMany({
    where: { projectId },
    include: { creator: { select: { id: true, name: true } } },
    orderBy: { startDate: "asc" },
  });
  return NextResponse.json(events);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { title, description, startDate, endDate, allDay, color } = await req.json();
  if (!title || !startDate || !endDate)
    return NextResponse.json({ error: "title/startDate/endDate required" }, { status: 400 });

  const event = await prisma.event.create({
    data: {
      title,
      description,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      allDay: allDay ?? false,
      color: color ?? "#6366f1",
      projectId,
      creatorId: userId,
    },
  });
  return NextResponse.json(event, { status: 201 });
}
