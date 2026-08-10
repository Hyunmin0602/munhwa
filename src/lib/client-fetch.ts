type ToastMessage = {
  id: number;
  type: "error" | "info";
  message: string;
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

export function subscribeToToasts(listener: (toasts: ToastMessage[]) => void) {
  toastListeners.add(listener);
  return () => toastListeners.delete(listener);
}

export async function apiFetch(input: RequestInfo, init?: RequestInit, options?: { retries?: number }) {
  const retries = options?.retries ?? 2;
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
        showToast("서버가 잠시 불안정합니다. 잠시 후 다시 시도해 주세요.");
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
      if ((error as any)?.status !== 401) {
        showToast("요청 처리 중 오류가 발생했습니다.");
      }
      throw error;
    }
  }
}
