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
    select: { space: { select: { adminUserId: true } } },
  });
  if (project?.space?.adminUserId === userId) return true;

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

export async function canManageCultureSportsContent(userId: string) {
  return (await assertAdmin(userId)) || (await assertSpaceAdmin(userId));
}

export async function canViewAllArchivePosts(userId: string, projectId: string) {
  if (await assertAdmin(userId)) return true;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { space: { select: { adminUserId: true } } },
  });
  return project?.space?.adminUserId === userId;
}

export async function canManageSpace(userId: string, spaceId: string) {
  if (await assertAdmin(userId)) return true;
  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: { adminUserId: true },
  });
  return space?.adminUserId === userId;
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}
