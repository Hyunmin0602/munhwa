import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const DEFAULT_SPACE_ID = "culture-sports";

export async function getSessionUser() {
  const session = await auth();
  return session?.user ?? null;
}

export async function requireSessionUserOrNull() {
  return await getSessionUser();
}

export async function canViewAllProjects(userId: string) {
  return assertAdmin(userId);
}

export async function assertProjectMember(userId: string, projectId: string) {
  if (await assertAdmin(userId)) return true;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { space: { select: { id: true, adminUserId: true } } },
  });
  if (project?.space?.adminUserId === userId) return true;
  if (project?.space?.id && await assertSpaceManager(userId, project.space.id)) return true;

  const member = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
    select: { id: true },
  });
  return !!member;
}

export async function assertProjectAccess(userId: string, projectId: string) {
  return assertProjectMember(userId, projectId);
}

export async function assertProjectOwner(userId: string, projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });
  if (project?.ownerId) return project.ownerId === userId;

  const member = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
    select: { role: true },
  });
  return member?.role === "owner";
}

export async function assertAdmin(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return user?.role?.trim().toLowerCase() === "admin";
}

export async function assertSpaceAdmin(userId: string) {
  try {
    const assignment = await prisma.spaceAdministration.findUnique({
      where: { id: "culture-sports" },
      select: {
        spaceAdminUserId: true,
        spaceAdmin: { select: { role: true } },
      },
    });
    if (assignment) {
      return assignment.spaceAdminUserId === userId;
    }

    const space = await prisma.space.findUnique({
      where: { id: DEFAULT_SPACE_ID },
      select: { adminUserId: true },
    });
    return space?.adminUserId === userId;
  } catch (error) {
    // Space administration is optional for databases created before this feature.
    console.warn("[space-admin] lookup unavailable", error);
    return false;
  }
}

export async function assertSpaceManager(userId: string, spaceId = DEFAULT_SPACE_ID) {
  if (await assertAdmin(userId)) return true;

  const [space, membership, user] = await Promise.all([
    prisma.space.findUnique({ where: { id: spaceId }, select: { adminUserId: true } }),
    prisma.spaceMember.findUnique({ where: { spaceId_userId: { spaceId, userId } }, select: { role: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
  ]);
  return space?.adminUserId === userId
    || membership?.role?.trim().toLowerCase() === "manager"
    || membership?.role?.trim().toLowerCase() === "space_manager"
    || (spaceId === DEFAULT_SPACE_ID && user?.role?.trim().toLowerCase() === "space_manager");
}

export async function canManageCultureSportsContent(userId: string) {
  return assertSpaceManager(userId);
}

export async function canManageProject(userId: string, projectId: string) {
  if (await assertAdmin(userId)) return true;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { spaceId: true } });
  return !!project?.spaceId && await assertSpaceManager(userId, project.spaceId);
}

export async function canViewAllArchivePosts(userId: string, projectId: string) {
  if (await assertAdmin(userId)) return true;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { space: { select: { id: true, adminUserId: true } } },
  });
  if (project?.space?.adminUserId === userId) return true;
  if (!project?.space?.id) return false;
  return await assertSpaceManager(userId, project.space.id);
}

export async function canManageSpace(userId: string, spaceId: string) {
  if (await assertAdmin(userId)) return true;
  const space = await prisma.space.findUnique({ where: { id: spaceId }, select: { adminUserId: true } });
  return space?.adminUserId === userId;
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export async function recordActivity(input: {
  actorId: string;
  projectId?: string | null;
  type: string;
  action: string;
  entityType: string;
  entityId: string;
  title?: string | null;
  metadata?: Record<string, unknown>;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
}) {
  try {
    let spaceId: string | null = null;
    if (input.projectId) {
      const project = await prisma.project.findUnique({ where: { id: input.projectId }, select: { spaceId: true } });
      spaceId = project?.spaceId ?? null;
    }
    if (!spaceId) return;
    await prisma.activityLog.create({
      data: {
        spaceId,
        actorId: input.actorId,
        projectId: input.projectId ?? null,
        type: input.type,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        title: input.title ?? null,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        beforeData: input.beforeData ? JSON.stringify(input.beforeData) : null,
        afterData: input.afterData ? JSON.stringify(input.afterData) : null,
      },
    });
  } catch (error) {
    console.error("[activity-log] failed", error);
  }
}
