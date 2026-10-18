import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { apiError, forbidden, internalError, notFound, unauthorized } from "@/lib/api-error";
import { withDbReadRetry, withDbWrite } from "@/lib/db-retry";
import { prisma } from "@/lib/prisma";
import { assertProjectEditor, assertProjectMember, recordActivity } from "@/lib/server-utils";
import { InputValidationError, optionalText, readJsonObject } from "@/lib/validation";

type Params = { params: Promise<{ projectId: string; eventId: string }> };

export async function GET(_: NextRequest, { params }: Params) {
  try {
    const { projectId, eventId } = await params;
    const session = await auth();
    if (!session?.user?.id) return unauthorized();
    if (!(await assertProjectMember(session.user.id, projectId))) return forbidden();

    const event = await withDbReadRetry(() => prisma.event.findFirst({ where: { id: eventId, projectId }, select: { id: true } }));
    if (!event) return notFound("일정을 찾을 수 없습니다.");
    const comments = await withDbReadRetry(() => prisma.eventComment.findMany({
      where: { eventId },
      select: { id: true, content: true, createdAt: true, updatedAt: true, author: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }));
    return NextResponse.json(comments);
  } catch {
    return internalError("일정 코멘트를 불러오지 못했습니다.");
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { projectId, eventId } = await params;
    const session = await auth();
    if (!session?.user?.id) return unauthorized();
    const userId = session.user.id;
    if (!(await assertProjectEditor(userId, projectId))) return forbidden();

    const event = await withDbReadRetry(() => prisma.event.findFirst({ where: { id: eventId, projectId }, select: { id: true, title: true } }));
    if (!event) return notFound("일정을 찾을 수 없습니다.");
    const data = await readJsonObject(req);
    const content = optionalText(data.content, "코멘트", 2_000);
    if (!content) return apiError("VALIDATION_ERROR", "코멘트를 입력해주세요.", 400);
    const comment = await withDbWrite(() => prisma.eventComment.create({
      data: { eventId, authorId: userId, content },
      select: { id: true, content: true, createdAt: true, updatedAt: true, author: { select: { id: true, name: true } } },
    }));
    await recordActivity({ actorId: userId, projectId, type: "일정", action: "댓글 작성", entityType: "EVENT_COMMENT", entityId: comment.id, title: event.title, afterData: { eventId } });
    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    if (error instanceof InputValidationError) return apiError("VALIDATION_ERROR", error.message, 400);
    return internalError("일정 코멘트를 저장하지 못했습니다.");
  }
}
