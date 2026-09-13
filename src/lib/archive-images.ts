export const MAX_ARCHIVE_IMAGE_BYTES = 4 * 1024 * 1024;

const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;

export type ArchiveImageMimeType = keyof typeof IMAGE_TYPES;

export function isArchiveImageMimeType(value: string): value is ArchiveImageMimeType {
  return value in IMAGE_TYPES;
}

export function archiveImageExtension(mimeType: ArchiveImageMimeType) {
  return IMAGE_TYPES[mimeType];
}

export function hasValidArchiveImageSignature(bytes: Uint8Array, mimeType: ArchiveImageMimeType) {
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.length >= 8 && bytes.slice(0, 8).every((byte, index) => byte === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]);
  if (mimeType === "image/gif") return bytes.length >= 6 && ("GIF87a" === String.fromCharCode(...bytes.slice(0, 6)) || "GIF89a" === String.fromCharCode(...bytes.slice(0, 6)));
  return bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}
