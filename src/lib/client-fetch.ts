type ToastMessage = {
  id: number;
  type: "error" | "info";
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

class ApiFetchError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiFetchError";
    this.status = status;
  }
}

const toastListeners = new Set<(toasts: ToastMessage[]) => void>();
let toastSeq = 0;
let toasts: ToastMessage[] = [];

function emitToastChange() {
  for (const listener of toastListeners) listener([...toasts]);
}

export function showToast(message: string, type: ToastMessage["type"] = "error") {
  toastSeq += 1;
  const item: ToastMessage = { id: toastSeq, type, message };
  toasts = [...toasts, item];
  emitToastChange();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== item.id);
    emitToastChange();
  }, 3200);
}

export function showUndoToast(
  message: string,
  onCommit: () => Promise<void> | void,
  onUndo: () => void,
  duration = 8000
) {
  toastSeq += 1;
  const item: ToastMessage = { id: toastSeq, type: "info", message, actionLabel: "실행 취소" };
  const dismiss = () => {
    toasts = toasts.filter((toast) => toast.id !== item.id);
    emitToastChange();
  };
  const timer = setTimeout(() => {
    dismiss();
    void onCommit();
  }, duration);

  item.onAction = () => {
    clearTimeout(timer);
    dismiss();
    onUndo();
  };
  toasts = [...toasts, item];
  emitToastChange();
}

export function subscribeToToasts(listener: (toasts: ToastMessage[]) => void) {
  toastListeners.add(listener);
  return () => toastListeners.delete(listener);
}

export async function getModalRequestErrorMessage(response: Response, action: string) {
  if (response.status === 400) {
    const data = await response.json().catch(() => null);
    const message = typeof data?.error?.message === "string" ? data.error.message : typeof data?.error === "string" ? data.error : "";
    return /[가-힣]/.test(message) ? message : "입력 내용을 확인한 뒤 다시 시도해주세요.";
  }
  if (response.status === 403) return "이 작업을 수행할 권한이 없습니다.";
  if (response.status === 404) return "대상을 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 시도해주세요.";
  if (response.status === 409) {
    const data = await response.json().catch(() => null);
    return typeof data?.error?.message === "string" ? data.error.message : typeof data?.error === "string" ? data.error : "다른 사용자가 먼저 변경했습니다. 최신 내용을 불러온 뒤 다시 시도해주세요.";
  }
  return `${action}을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.`;
}

export function getModalExceptionMessage(error: unknown, action: string) {
  const status = typeof error === "object" && error !== null && "status" in error
    ? (error as { status?: unknown }).status
    : undefined;
  if (status === 500) return `${action}을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.`;
  return "요청을 완료하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해주세요.";
}

type ApiFetchOptions = {
  retries?: number;
  showGlobalError?: boolean;
};

function waitForRetry(ms: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted();
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function apiFetch(input: RequestInfo, init?: RequestInit, options?: ApiFetchOptions) {
  const request = typeof Request !== "undefined" && input instanceof Request ? input : undefined;
  const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
  const safeToRetry = method === "GET" || method === "HEAD";
  const configuredRetries = options?.retries ?? 2;
  const retries = safeToRetry && Number.isFinite(configuredRetries)
    ? Math.max(0, Math.floor(configuredRetries)) : 0;
  const signal = init?.signal !== undefined ? init.signal : request?.signal;
  const showGlobalError = options?.showGlobalError ?? true;
  let attempt = 0;
  const callbackUrl = typeof window !== "undefined" ? window.location.pathname : "/";

  while (true) {
    try {
      signal?.throwIfAborted();
      const res = await fetch(input, init);

      if (res.status === 401) {
        if (typeof window !== "undefined") {
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
        }
        throw new ApiFetchError("Unauthorized", 401);
      }

      if (res.status >= 500) {
        const payload = await res.json().catch(() => null);
        const message = typeof payload?.error?.message === "string" ? payload.error.message
          : typeof payload?.error === "string" ? payload.error : "Server error";
        throw new ApiFetchError(message, res.status);
      }

      return res;
    } catch (error) {
      const aborted = signal?.aborted || (error instanceof Error && error.name === "AbortError");
      if (aborted) throw error;
      const status = error instanceof ApiFetchError ? error.status : undefined;
      const retryable = error instanceof ApiFetchError
        ? [500, 502, 503, 504].includes(error.status)
        : error instanceof TypeError;
      if (retryable && attempt < retries) {
        attempt += 1;
        await waitForRetry(200 * Math.pow(2, attempt), signal);
        continue;
      }
      if (showGlobalError && status !== 401) {
        showToast(typeof status === "number" && status >= 500
          ? "서버가 잠시 불안정합니다. 잠시 후 다시 시도해 주세요."
          : "요청 처리 중 오류가 발생했습니다.");
      }
      throw error;
    }
  }
}
