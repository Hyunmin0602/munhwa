import path from "node:path";
import { readFile, unlink } from "node:fs/promises";
import { get } from "@vercel/blob";

export function localArchiveImagePath(storageKey: string, legacy = false) {
  if (!/^archive\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(?:jpe?g|png|webp|gif)$/.test(storageKey)) {
    throw new Error("Invalid archive image storage key");
  }
  const root = legacy ? path.join(process.cwd(), "public", "uploads")
    : path.join(process.cwd(), ".private", "archive-images");
  return path.join(root, storageKey);
}

export function isLocalArchiveImage(url: string) {
  return url.startsWith("local:") || url.startsWith("/uploads/");
}

export async function removeLocalArchiveImage(storageKey: string, url: string) {
  await unlink(localArchiveImagePath(storageKey, url.startsWith("/uploads/"))).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

export async function archiveImageResponse(image: { storageKey: string; url: string; mimeType: string }) {
  const headers = { "Content-Type": image.mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (isLocalArchiveImage(image.url)) {
    const bytes = await readFile(localArchiveImagePath(image.storageKey, image.url.startsWith("/uploads/")));
    return new Response(new Uint8Array(bytes), { headers });
  }
  const result = await get(image.storageKey, { access: "private", token: process.env.BLOB_READ_WRITE_TOKEN });
  if (!result || result.statusCode === 304 || !result.stream) return null;
  return new Response(result.stream, { headers });
}
