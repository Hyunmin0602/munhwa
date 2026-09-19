type ToastMessage = {
  id: number;
  type: "error" | "info";
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

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
    const message = typeof data?.error === "string" ? data.error : "";
    return /[가-힣]/.test(message) ? message : "입력 내용을 확인한 뒤 다시 시도해주세요.";
  }
  if (response.status === 403) return "이 작업을 수행할 권한이 없습니다.";
  if (response.status === 404) return "대상을 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 시도해주세요.";
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

export async function apiFetch(input: RequestInfo, init?: RequestInit, options?: ApiFetchOptions) {
  const method = (init?.method ?? "GET").toUpperCase();
  const retries = options?.retries ?? (method === "GET" || method === "HEAD" ? 2 : 0);
  const showGlobalError = options?.showGlobalError ?? true;
  let attempt = 0;
  const callbackUrl = typeof window !== "undefined" ? window.location.pathname : "/";

  while (true) {
    try {
      const res = await fetch(input, init);

      if (res.status === 401) {
        window.location.href = `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
        const err: any = new Error("Unauthorized");
        err.status = 401;
        throw err;
      }

      if (res.status >= 500) {
        if (attempt < retries) {
          attempt += 1;
          await new Promise((resolve) => setTimeout(resolve, 200 * Math.pow(2, attempt)));
          continue;
        }
        const err: any = new Error("Server error");
        err.status = res.status;
        throw err;
      }

      return res;
    } catch (error) {
      if (attempt < retries) {
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, 200 * Math.pow(2, attempt)));
        continue;
      }
      const status = typeof error === "object" && error !== null && "status" in error
        ? (error as { status?: unknown }).status
        : undefined;
      if (showGlobalError && status !== 401) {
        showToast(status === 500 || (typeof status === "number" && status >= 500)
          ? "서버가 잠시 불안정합니다. 잠시 후 다시 시도해 주세요."
          : "요청 처리 중 오류가 발생했습니다.");
      }
      throw error;
    }
  }
}
