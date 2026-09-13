import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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
  if (await canManageCultureSportsContent(userId)) return true;

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
  return user?.role === "admin";
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
    return assignment?.spaceAdminUserId === userId && assignment.spaceAdmin.role === "space_admin";
  } catch (error) {
    // Space administration is optional for databases created before this feature.
    console.warn("[space-admin] lookup unavailable", error);
    return false;
  }
}

export async function canManageCultureSportsContent(userId: string) {
  return (await assertAdmin(userId)) || (await assertSpaceAdmin(userId));
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}
