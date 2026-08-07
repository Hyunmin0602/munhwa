import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function getSessionUser() {
  const session = await auth();
  return session?.user ?? null;
}

export async function requireSessionUserOrNull() {
  return await getSessionUser();
}

export async function assertProjectMember(userId: string, projectId: string) {
  const member = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
    select: { id: true },
  });
  return !!member;
}

export async function assertProjectOwner(userId: string, projectId: string) {
  const member = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
    select: { role: true },
  });
  return member?.role === "owner";
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}
