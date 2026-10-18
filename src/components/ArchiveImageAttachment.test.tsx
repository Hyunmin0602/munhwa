import assert from "node:assert/strict";
import test from "node:test";
import { Children, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ArchiveImageAttachment from "./ArchiveImageAttachment";

test("thumbnail insertion and deletion are separate sibling actions", () => {
  let inserted = 0;
  let deleted = 0;
  const element = ArchiveImageAttachment({ url: "/api/image", onInsert: () => inserted++, onDelete: () => deleted++ });
  const buttons = Children.toArray(element.props.children) as ReactElement<{ onClick: () => void; "aria-label": string }>[];
  const insert = buttons.find((button) => button.props["aria-label"] === "첨부 이미지를 본문에 삽입")!;
  const remove = buttons.find((button) => button.props["aria-label"] === "첨부 이미지 삭제")!;
  insert.props.onClick();
  assert.equal(inserted, 1);
  assert.equal(deleted, 0);
  remove.props.onClick();
  assert.equal(inserted, 1);
  assert.equal(deleted, 1);
  const html = renderToStaticMarkup(element);
  assert.match(html, /<\/button><button/);
  assert.doesNotMatch(html, /absolute|inset-0|opacity-0/);
});
