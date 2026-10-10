import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbReadRetry, withDbWrite } from "@/lib/db-retry";
import { InputValidationError, optionalText, projectColor, readJsonObject, requiredText } from "@/lib/validation";

function normalizeNameKey(name: string) {
  return name.normalize("NFC").trim().toLowerCase();
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const labels = await withDbReadRetry(() => prisma.eventLabel.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      color: true,
      createdAt: true,
      updatedAt: true,
      createdBy: true,
    },
    orderBy: [{ createdAt: "asc" }, { name: "asc" }],
  }));
  return NextResponse.json(labels);
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const data = await readJsonObject(request);
    const name = requiredText(data.name, "라벨 이름", 60);
    const nameKey = normalizeNameKey(name);
    const description = optionalText(data.description, "라벨 설명", 200);
    const color = projectColor(data.color);

    const existing = await withDbReadRetry(() => prisma.eventLabel.findUnique({ where: { nameKey }, select: { id: true } }));
    if (existing) return NextResponse.json({ error: "같은 이름의 라벨이 이미 있습니다." }, { status: 409 });

    const label = await withDbWrite(() => prisma.eventLabel.create({
      data: {
        name,
        nameKey,
        description,
        color,
        createdBy: session.user.id,
      },
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        createdAt: true,
        updatedAt: true,
        createdBy: true,
      },
    }));
    return NextResponse.json(label, { status: 201 });
  } catch (error) {
    if (error instanceof InputValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[api/event-labels] POST failed", error);
    return NextResponse.json({ error: "라벨 생성에 실패했습니다." }, { status: 500 });
  }
}