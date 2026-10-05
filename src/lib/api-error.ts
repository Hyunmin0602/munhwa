import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  headers?: HeadersInit,
) {
  return NextResponse.json({ error: { code, message } }, { status, headers });
}

export const unauthorized = (message = "로그인이 필요합니다.") => apiError("UNAUTHORIZED", message, 401);
export const forbidden = (message = "이 작업을 수행할 권한이 없습니다.") => apiError("FORBIDDEN", message, 403);
export const notFound = (message = "요청한 리소스를 찾을 수 없습니다.") => apiError("NOT_FOUND", message, 404);
export const validationError = (message: string) => apiError("VALIDATION_ERROR", message, 400);
export const internalError = (message = "요청을 처리하지 못했습니다.") => apiError("INTERNAL_ERROR", message, 500);
