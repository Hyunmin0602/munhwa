import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbReadRetry, withDbWrite } from "@/lib/db-retry";
import { InputValidationError, optionalText, projectColor, readJsonObject, requiredText } from "@/lib/validation";

type Params = { params: Promise<{ labelId: string }> };

function normalizeNameKey(name: string) {
  return name.normalize("NFC").trim().toLowerCase();
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { labelId } = await params;
    const current = await withDbReadRetry(() => prisma.eventLabel.findUnique({
      where: { id: labelId },
      select: { id: true },
    }));
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data = await readJsonObject(request);
    const name = requiredText(data.name, "라벨 이름", 60);
    const nameKey = normalizeNameKey(name);
    const description = optionalText(data.description, "라벨 설명", 200);
    const color = projectColor(data.color);

    const duplicate = await withDbReadRetry(() => prisma.eventLabel.findFirst({
      where: { nameKey, NOT: { id: labelId } },
      select: { id: true },
    }));
    if (duplicate) return NextResponse.json({ error: "같은 이름의 라벨이 이미 있습니다." }, { status: 409 });

    const label = await withDbWrite(() => prisma.eventLabel.update({
      where: { id: labelId },
      data: { name, nameKey, description, color },
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
    return NextResponse.json(label);
  } catch (error) {
    if (error instanceof InputValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[api/event-labels/:labelId] PATCH failed", error);
    return NextResponse.json({ error: "라벨 수정에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: Params) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { labelId } = await params;

    const label = await withDbReadRetry(() => prisma.eventLabel.findUnique({ where: { id: labelId }, select: { id: true, name: true } }));
    if (!label) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const eventCount = await withDbReadRetry(() => prisma.event.count({ where: { labelId } }));
    if (eventCount > 0) {
      return NextResponse.json({ error: "이 라벨을 사용하는 일정이 있어 삭제할 수 없습니다." }, { status: 409 });
    }

    await withDbWrite(() => prisma.eventLabel.delete({ where: { id: labelId } }));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof InputValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[api/event-labels/:labelId] DELETE failed", error);
    return NextResponse.json({ error: "라벨 삭제에 실패했습니다." }, { status: 500 });
  }
}