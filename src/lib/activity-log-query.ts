import type { Prisma } from "@prisma/client";
import { InputValidationError } from "./validation";

function textFilter(params: URLSearchParams, key: string, max = 100) {
  const value = params.get(key)?.trim() ?? "";
  if (value.length > max) throw new InputValidationError("검색 조건이 너무 깁니다.");
  return value;
}

function koreaDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new InputValidationError("날짜를 올바르게 선택해주세요.");
  const day = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== value) throw new InputValidationError("날짜를 올바르게 선택해주세요.");
  return new Date(`${value}T00:00:00+09:00`);
}

export function activityLogCursor(log: { id: string; createdAt: Date }, order: "asc" | "desc") {
  return Buffer.from(JSON.stringify({ v: 1, id: log.id, timestamp: log.createdAt.toISOString(), order })).toString("base64url");
}

export function activityLogQuery(params: URLSearchParams, spaceId: string) {
  const requestedLimit = params.get("limit");
  const limitValue = requestedLimit === null ? 30 : Number(requestedLimit);
  if (!Number.isInteger(limitValue) || limitValue < 1) throw new InputValidationError("조회 개수가 올바르지 않습니다.");
  const limit = Math.min(limitValue, 50);
  const orderValue = params.get("order") ?? "desc";
  if (orderValue !== "asc" && orderValue !== "desc") throw new InputValidationError("정렬 순서가 올바르지 않습니다.");
  const order: "asc" | "desc" = orderValue;
  const query = textFilter(params, "query");
  const type = textFilter(params, "type", 30);
  const action = textFilter(params, "action", 30);
  const actor = textFilter(params, "actor");
  const project = textFilter(params, "project");
  const from = params.get("from");
  const to = params.get("to");
  const start = from ? koreaDate(from) : null;
  const end = to ? new Date(koreaDate(to).getTime() + 86_400_000) : null;
  if (start && end && start >= end) throw new InputValidationError("시작일은 종료일보다 늦을 수 없습니다.");
  const where: Prisma.ActivityLogWhereInput = {
    spaceId,
    ...(type ? { type } : {}),
    ...(action ? { action } : {}),
    ...(start || end ? { createdAt: { ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) } } : {}),
    ...(actor ? { actor: { OR: [{ name: { contains: actor } }, { email: { contains: actor } }] } } : {}),
    ...(project ? { project: { name: { contains: project } } } : {}),
    ...(query ? { OR: [{ title: { contains: query } }, { action: { contains: query } }, { entityId: { contains: query } }, { actor: { name: { contains: query } } }, { actor: { email: { contains: query } } }, { project: { name: { contains: query } } }] } : {}),
  };
  const cursor = params.get("cursor");
  if (cursor) {
    try {
      if (cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("invalid cursor");
      const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
      if (!value || value.v !== 1 || value.order !== order || typeof value.id !== "string" || !value.id || value.id.length > 200 || typeof value.timestamp !== "string") throw new Error("invalid cursor");
      const createdAt = new Date(value.timestamp);
      if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== value.timestamp) throw new Error("invalid cursor");
      const comparison = order === "desc" ? "lt" : "gt";
      where.AND = [{ OR: [{ createdAt: { [comparison]: createdAt } }, { createdAt, id: { [comparison]: value.id } }] }];
    } catch {
      throw new InputValidationError("로그 페이지 값이 올바르지 않습니다. 새로고침해주세요.");
    }
  }
  return { where, limit, order };
}
