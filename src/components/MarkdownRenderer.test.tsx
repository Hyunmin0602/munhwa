import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import MarkdownRenderer from "./MarkdownRenderer";

test("Markdown renderer preserves approved layout markup and removes unsafe HTML", () => {
  const html = renderToStaticMarkup(
    <MarkdownRenderer content={'<section class="md-grid md-grid--two"><div>안전한 열</div><div>두 번째 열</div></section><script>alert("xss")</script><img src="javascript:alert(1)" onerror="alert(1)" alt="위험" />'} />
  );

  assert.match(html, /md-grid md-grid--two/);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /onerror/i);
  assert.doesNotMatch(html, /javascript:/i);
});

test("Markdown renderer preserves HTTPS image URLs and protects external links", () => {
  const html = renderToStaticMarkup(
    <MarkdownRenderer content={'<figure class="md-figure md-figure--center"><img src="https://example.com/image.png" alt="이미지" /></figure><a href="https://example.com">외부 링크</a>'} />
  );

  assert.match(html, /https:\/\/example\.com\/image\.png/);
  assert.match(html, /rel="noopener noreferrer"/);
});
