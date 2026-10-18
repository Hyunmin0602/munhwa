export const ARCHIVE_VISIBILITY_VALUES = ["PRIVATE", "INTERNAL", "EXTERNAL"] as const;

export type ArchiveVisibility = (typeof ARCHIVE_VISIBILITY_VALUES)[number];

export function normalizeArchiveVisibility(value: unknown): ArchiveVisibility {
  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();
    if (normalized === "PUBLIC") return "EXTERNAL";
    if (ARCHIVE_VISIBILITY_VALUES.includes(normalized as ArchiveVisibility)) {
      return normalized as ArchiveVisibility;
    }
  }
  return "PRIVATE";
}

export function getEffectiveArchiveVisibility(post?: { visibility?: string | null; published?: boolean | null }) {
  if (!post) return "PRIVATE";
  if (post.visibility) return normalizeArchiveVisibility(post.visibility);
  return post.published ? "EXTERNAL" : "PRIVATE";
}

export function isArchivePublic(post?: { visibility?: string | null; published?: boolean | null }) {
  return getEffectiveArchiveVisibility(post) === "EXTERNAL";
}

export function canReadArchivePost(post: { authorId: string; visibility: string; collaborators: { userId: string }[] }, userId: string, canViewAll: boolean) {
  return canViewAll || post.visibility !== "PRIVATE" || post.authorId === userId
    || post.collaborators.some((collaborator) => collaborator.userId === userId);
}
