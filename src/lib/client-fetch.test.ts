import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getModalRequestErrorMessage } from "./client-fetch";

test("structured conflict responses render the server message as text", async () => {
  const message = "기록용 사업은 수정할 수 없습니다. 먼저 복원해주세요.";
  const response = Response.json({ error: { code: "CONFLICT", message } }, { status: 409 });
  const text = await getModalRequestErrorMessage(response, "사업 수정");
  assert.equal(text, message);
  assert.equal(renderToStaticMarkup(createElement("p", null, text)), `<p>${message}</p>`);
});

test("modal errors tolerate legacy messages and malformed response bodies", async () => {
  assert.equal(await getModalRequestErrorMessage(Response.json({ error: "이미 등록된 구성원입니다." }, { status: 409 }), "구성원 추가"), "이미 등록된 구성원입니다.");
  assert.equal(await getModalRequestErrorMessage(new Response("bad response", { status: 400 }), "사업 수정"), "입력 내용을 확인한 뒤 다시 시도해주세요.");
  assert.equal(typeof await getModalRequestErrorMessage(Response.json({ error: { code: "CONFLICT", message: {} } }, { status: 409 }), "사업 수정"), "string");
});
