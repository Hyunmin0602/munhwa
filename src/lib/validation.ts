export const MAX_JSON_BODY_BYTES = 16 * 1024;

export class InputValidationError extends Error {}

function invalid(message: string): never {
  throw new InputValidationError(message);
}

export async function readJsonObject(request: Request, maxBytes = MAX_JSON_BODY_BYTES): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    invalid("JSON 요청만 허용됩니다.");
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) invalid("요청 본문이 너무 큽니다.");

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) invalid("요청 본문이 너무 큽니다.");
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) invalid("올바른 요청 형식이 아닙니다.");
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof InputValidationError) throw error;
    invalid("올바른 JSON 형식이 아닙니다.");
  }
}

export function normalizeEmail(value: unknown) {
  if (typeof value !== "string") invalid("올바른 이메일 주소를 입력해주세요.");
  const email = value.normalize("NFC").trim().toLowerCase();
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(email)) {
    invalid("올바른 이메일 주소를 입력해주세요.");
  }
  return email;
}

export function requiredText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string") invalid(`${label}을(를) 입력해주세요.`);
  const text = value.normalize("NFC").trim();
  if (!text || text.length > maxLength || /[\u0000-\u001f\u007f]/.test(text)) invalid(`올바른 ${label}을(를) 입력해주세요.`);
  return text;
}

export function password(value: unknown) {
  if (typeof value !== "string" || value.length < 12 || value.length > 128 || !value.trim()) {
    invalid("비밀번호는 공백만으로 구성되지 않은 12~128자여야 합니다.");
  }
  return value;
}

export function optionalText(value: unknown, label: string, maxLength: number) {
  if (value === undefined || value === null) return null;
  return requiredText(value, label, maxLength);
}

export function projectTags(value: unknown) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length > 10) invalid("태그는 최대 10개까지 입력할 수 있습니다.");
  const tags = [...new Set(value.map((tag) => requiredText(tag, "태그", 30)))];
  return tags.join(",") || null;
}

export function projectStatus(value: unknown) {
  if (value === undefined || value === null) return "planning";
  if (typeof value !== "string" || !["planning", "active", "paused", "completed"].includes(value)) {
    invalid("올바른 사업 상태를 선택해주세요.");
  }
  return value;
}

export function projectColor(value: unknown) {
  if (value === undefined || value === null) return "#6366f1";
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) invalid("올바른 색상 값을 선택해주세요.");
  return value;
}

export function eventDates(startDate: unknown, endDate: unknown) {
  if (typeof startDate !== "string" || typeof endDate !== "string") invalid("일정 시작일과 종료일을 입력해주세요.");
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) invalid("올바른 일정 기간을 입력해주세요.");
  return { start, end };
}

export function eventAllDay(value: unknown) {
  if (value === undefined || value === null) return false;
  if (typeof value !== "boolean") invalid("종일 일정 값이 올바르지 않습니다.");
  return value;
}

export function integratedKanbanStatus(value: unknown) {
  if (value === null) return null;
  if (typeof value !== "string" || !["BEFORE", "IN_PROGRESS", "DONE"].includes(value)) {
    invalid("올바른 통합 상태를 선택해주세요.");
  }
  return value;
}

export function booleanValue(value: unknown, label: string) {
  if (typeof value !== "boolean") invalid(`${label} 값이 올바르지 않습니다.`);
  return value;
}