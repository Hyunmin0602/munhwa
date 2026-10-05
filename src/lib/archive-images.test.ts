import assert from "node:assert/strict";
import test from "node:test";
import { hasValidArchiveImageSignature, isArchiveImageMimeType, MAX_ARCHIVE_IMAGE_BYTES } from "./archive-images";

test("only approved archive image MIME types are accepted", () => {
  assert.equal(isArchiveImageMimeType("image/jpeg"), true);
  assert.equal(isArchiveImageMimeType("image/png"), true);
  assert.equal(isArchiveImageMimeType("image/svg+xml"), false);
  assert.equal(isArchiveImageMimeType("text/html"), false);
});

test("archive image signatures must match their MIME type", () => {
  assert.equal(hasValidArchiveImageSignature(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg"), true);
  assert.equal(hasValidArchiveImageSignature(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png"), true);
  assert.equal(hasValidArchiveImageSignature(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), "image/gif"), true);
  assert.equal(hasValidArchiveImageSignature(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]), "image/webp"), true);
  assert.equal(hasValidArchiveImageSignature(new Uint8Array([0x3c, 0x73, 0x76, 0x67]), "image/png"), false);
});

test("archive image limit is four mebibytes", () => {
  assert.equal(MAX_ARCHIVE_IMAGE_BYTES, 4 * 1024 * 1024);
});
