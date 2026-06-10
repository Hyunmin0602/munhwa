import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ projectId: string; eventId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { eventId } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  const event = await prisma.event.update({
    where: { id: eventId },
    data: {
      title: data.title,
      description: data.description,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
      allDay: data.allDay,
      color: data.color,
    },
  });
  return NextResponse.json(event);
}

export async function DELETE(_: NextRequest, { params }: Params) {
  const { eventId } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.event.delete({ where: { id: eventId } });
  return NextResponse.json({ ok: true });
}
