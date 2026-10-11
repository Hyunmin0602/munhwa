import { prisma } from "@/lib/prisma";
import { withDbReadRetry, withDbWrite } from "@/lib/db-retry";

export type NotificationCategory = "mention" | "assignment" | "dueDate" | "meeting" | "approval";

const preferenceField = {
  mention: "mentionNotifications",
  assignment: "assignmentNotifications",
  dueDate: "dueDateNotifications",
  meeting: "meetingNotifications",
  approval: "approvalNotifications",
} as const;

export async function createInAppNotification(input: {
  recipientId: string;
  actorId?: string | null;
  category: NotificationCategory;
  title: string;
  body: string;
  href: string;
  dedupeKey?: string;
}) {
  try {
    const field = preferenceField[input.category];
    const preference = await withDbReadRetry(() => prisma.notificationPreference.findUnique({
      where: { userId: input.recipientId },
      select: { [field]: true },
    }));
    if (preference && preference[field] === false) return null;
    return await withDbWrite(() => {
      const data = {
        recipientId: input.recipientId,
        actorId: input.actorId ?? null,
        type: input.category === "dueDate" ? "DUE_DATE" : input.category.toUpperCase(),
        title: input.title,
        body: input.body,
        href: input.href,
        dedupeKey: input.dedupeKey,
      };
      return input.dedupeKey
        ? prisma.notification.upsert({ where: { dedupeKey: input.dedupeKey }, create: data, update: {}, select: { id: true } })
        : prisma.notification.create({ data, select: { id: true } });
    });
  } catch (error) {
    console.error("[notifications] in-app notification failed", error);
    return null;
  }
}
