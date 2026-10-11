import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import path from "node:path";
import test, { beforeEach } from "node:test";
import * as React from "react";
import * as clientFetch from "../lib/client-fetch";

const require = createRequire(path.join(process.cwd(), "package.json"));
const items = ["first", "second"].map((id) => ({ id, title: id, type: "MENTION", body: "알림", href: `/dashboard/${id}`, readAt: null, createdAt: "2026-10-11T00:00:00Z" }));
let slots: unknown[] = [];
let slotIndex = 0;
let load: () => Promise<void>;
let patch: () => Promise<Response>;
let patchCalls = 0;
const toasts: string[] = [];

// Run the real page's handlers with deterministic hooks and HTTP responses, without a browser or live server.
const mocks = [
  { filename: require.resolve("react"), exports: {
    ...React,
    useState(initial: unknown) {
      const index = slotIndex++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (next: unknown) => {
        slots[index] = typeof next === "function" ? (next as (value: unknown) => unknown)(slots[index]) : next;
      }];
    },
    useRef(initial: unknown) {
      const index = slotIndex++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback(callback: () => Promise<void>) { load = callback; return callback; },
    useEffect() {},
  } },
  { filename: path.join(process.cwd(), "src/lib/client-fetch.ts"), exports: {
    ...clientFetch,
    showToast(message: string) { toasts.push(message); },
    async apiFetch(_input: RequestInfo, init?: RequestInit) {
      if (init?.method === "PATCH") { patchCalls++; return patch(); }
      return Response.json({ items, unreadCount: items.length, nextCursor: null });
    },
  } },
];
const originals = mocks.map(({ filename, exports }) => {
  const original = require.cache[filename];
  const stub = new Module(filename);
  stub.exports = exports;
  stub.loaded = true;
  require.cache[filename] = stub;
  return { filename, original };
});
const Page = require(path.join(process.cwd(), "src/app/dashboard/notifications/page.tsx")).default as () => React.ReactNode;
for (const { filename, original } of originals) {
  if (original) require.cache[filename] = original;
  else delete require.cache[filename];
}

type Element = React.ReactElement<{ children?: React.ReactNode; href?: string; onClick?: () => void; role?: string; disabled?: boolean; className?: string }>;
function find(node: React.ReactNode, predicate: (element: Element) => boolean): Element | undefined {
  if (Array.isArray(node)) {
    for (const child of node) { const match = find(child, predicate); if (match) return match; }
  } else if (React.isValidElement<Element["props"]>(node)) {
    if (predicate(node)) return node;
    return find(node.props.children, predicate);
  }
}
function render() { slotIndex = 0; return Page(); }
function row(tree: React.ReactNode, id: string) { return find(tree, (node) => node.props.href === `/dashboard/${id}`)!; }
function allReadButton(tree: React.ReactNode) { return find(tree, (node) => node.type === "button" && Array.isArray(node.props.children) && node.props.children.includes("모두 읽음")); }
function unread(tree: React.ReactNode, id: string) { return row(tree, id).props.className?.includes("bg-indigo-50/50"); }
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

beforeEach(async () => {
  slots = [];
  patchCalls = 0;
  toasts.length = 0;
  patch = async () => Response.json({ ok: true });
  render();
  await load();
});

test("a failed individual read keeps the unread marker and reports the failure", async () => {
  for (const failure of ["network", "server", "forbidden"]) {
    patch = async () => {
      if (failure === "forbidden") return Response.json({ error: { code: "FORBIDDEN", message: "거부" } }, { status: 403 });
      throw Object.assign(new Error("private failure details"), failure === "server" ? { status: 500 } : {});
    };
    row(render(), "first").props.onClick!();
    await settle();
    const tree = render();
    assert.equal(unread(tree, "first"), true);
    assert.ok(find(tree, (node) => node.props.role === "alert"));
    assert.ok(allReadButton(tree));
    assert.equal(toasts.at(-1)?.includes("private failure details"), false);
  }
});

test("individual reads change only after success and ignore repeated clicks while pending", async () => {
  let complete!: (response: Response) => void;
  patch = () => new Promise((resolve) => { complete = resolve; });
  const first = row(render(), "first");
  first.props.onClick!();
  first.props.onClick!();
  assert.equal(patchCalls, 1);
  assert.equal(unread(render(), "first"), true);
  assert.equal(allReadButton(render())?.props.disabled, true);
  complete(Response.json({ ok: true }));
  await settle();
  assert.equal(unread(render(), "first"), false);
  assert.equal(unread(render(), "second"), true);
  row(render(), "first").props.onClick!();
  assert.equal(patchCalls, 1);
});

test("a failed read-all preserves all unread markers and can be retried", async () => {
  patch = async () => { throw Object.assign(new Error("server unavailable"), { status: 500 }); };
  allReadButton(render())!.props.onClick!();
  await settle();
  assert.equal(unread(render(), "first"), true);
  assert.equal(unread(render(), "second"), true);
  assert.equal(allReadButton(render())?.props.disabled, false);
  assert.ok(find(render(), (node) => node.props.role === "alert"));
  patch = async () => Response.json({ ok: true });
  allReadButton(render())!.props.onClick!();
  await settle();
  assert.equal(unread(render(), "first"), false);
  assert.equal(unread(render(), "second"), false);
  assert.equal(allReadButton(render()), undefined);
});

test("read-all does not send another write while pending", async () => {
  let complete!: (response: Response) => void;
  patch = () => new Promise((resolve) => { complete = resolve; });
  const button = allReadButton(render())!;
  button.props.onClick!();
  button.props.onClick!();
  row(render(), "first").props.onClick!();
  assert.equal(patchCalls, 1);
  complete(Response.json({ ok: true }));
  await settle();
});
