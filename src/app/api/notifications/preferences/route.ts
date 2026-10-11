import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { apiError, internalError, unauthorized } from "@/lib/api-error";
import { withDbReadRetry, withDbWrite } from "@/lib/db-retry";
import { prisma } from "@/lib/prisma";
import { readJsonObject } from "@/lib/validation";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  try {
    const preference = await withDbReadRetry(() => prisma.notificationPreference.findUnique({ where: { userId: session.user.id }, select: { mentionNotifications: true, assignmentNotifications: true, dueDateNotifications: true, meetingNotifications: true, approvalNotifications: true } }));
    return NextResponse.json({ mentionNotifications: preference?.mentionNotifications ?? true, assignmentNotifications: preference?.assignmentNotifications ?? true, dueDateNotifications: preference?.dueDateNotifications ?? true, meetingNotifications: preference?.meetingNotifications ?? true, approvalNotifications: preference?.approvalNotifications ?? true });
  } catch {
    return internalError("알림 설정을 불러오지 못했습니다.");
  }
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  try {
    const data = await readJsonObject(request);
    const fields = ["mentionNotifications", "assignmentNotifications", "dueDateNotifications", "meetingNotifications", "approvalNotifications"] as const;
    const field = fields.find((key) => typeof data[key] === "boolean");
    if (!field || fields.some((key) => key !== field && data[key] !== undefined)) return apiError("VALIDATION_ERROR", "알림 설정이 올바르지 않습니다.", 400);
    const preference = await withDbWrite(() => prisma.notificationPreference.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, [field]: data[field] as boolean },
      update: { [field]: data[field] as boolean },
      select: { mentionNotifications: true, assignmentNotifications: true, dueDateNotifications: true, meetingNotifications: true, approvalNotifications: true },
    }));
    return NextResponse.json(preference);
  } catch {
    return internalError("알림 설정을 저장하지 못했습니다.");
  }
}
