import assert from "node:assert/strict";
import test from "node:test";
import { escapeImageAlt, isSafeArchiveImageUrl } from "./archive-editor-images";

test("image blocks accept uploaded image routes and HTTPS without accepting arbitrary relative URLs", () => {
  for (const value of ["/api/projects/p1/archive/a1/images/i1", "/uploads/archive/p1/image-1.png", "https://example.test/picture.png"]) {
    assert.equal(isSafeArchiveImageUrl(value), true);
  }
  for (const value of ["javascript:alert(1)", "data:image/svg+xml,x", "//example.test/image", "/api/projects/p1/archive/a1/images/../../other", "/login", "http://example.test/image"]) {
    assert.equal(isSafeArchiveImageUrl(value), false);
  }
  assert.equal(escapeImageAlt("photo[1]\n"), "photo\\[1\\] ");
});
