export function isSafeArchiveImageUrl(value: string) {
  if (/^\/api\/projects\/[A-Za-z0-9_-]+\/archive\/[A-Za-z0-9_-]+\/images\/[A-Za-z0-9_-]+$/.test(value)) return true;
  if (/^\/uploads\/archive\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(?:jpe?g|png|webp|gif)$/.test(value)) return true;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export function escapeImageAlt(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]").replace(/[\r\n]/g, " ");
}
