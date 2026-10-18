import { prisma } from "@/lib/prisma";
import { withDbReadRetry } from "@/lib/db-retry";
import { assertProjectMember, canManageProject, canViewAllArchivePosts } from "@/lib/server-utils";
import { canReadArchivePost } from "@/lib/archive-visibility";

export async function getArchiveAccess(userId: string, projectId: string, postId: string) {
  if (!(await assertProjectMember(userId, projectId))) return null;
  const [post, canViewAll, canManage] = await Promise.all([
    withDbReadRetry(() => prisma.archivePost.findFirst({ where: { id: postId, projectId },
      select: { authorId: true, visibility: true, collaborators: { select: { userId: true } } } })),
    canViewAllArchivePosts(userId, projectId), canManageProject(userId, projectId),
  ]);
  if (!post) return null;
  const canRead = canReadArchivePost(post, userId, canViewAll);
  const collaborator = post.collaborators.some((person) => person.userId === userId);
  const canEdit = canManage || post.visibility === "INTERNAL" || post.authorId === userId || collaborator;
  return { canRead, canEdit, canManage };
}
