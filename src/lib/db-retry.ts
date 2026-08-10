type RetryContext = {
  operation?: string;
  retries?: number;
  baseDelayMs?: number;
};

const DEFAULT_RETRY_DELAYS_MS = [150, 400];
const RETRYABLE_MESSAGE_PATTERNS = [
  /timed out/i,
  /timeout/i,
  /network/i,
  /connection/i,
  /socket/i,
  /fetch failed/i,
  /temporarily unavailable/i,
  /SQLITE_BUSY/i,
  /SQLITE_IOERR/i,
  /server closed the connection/i,
];
const RETRYABLE_PRISMA_CODES = new Set(["P1001", "P1002", "P1008", "P1017"]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return null;
  if (!("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "unknown-error";
  }
}

function isRetryableDbError(error: unknown) {
  const code = getErrorCode(error);
  if (code && RETRYABLE_PRISMA_CODES.has(code)) return true;
  if (code && /^P2\d{3}$/.test(code)) return false;

  const message = getErrorMessage(error);
  return RETRYABLE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

function isTransientError(error: unknown) {
  const code = getErrorCode(error);
  if (code && ["econnreset", "etimedout", "econnrefused", "enotfound"].includes(code.toLowerCase())) return true;
  const message = getErrorMessage(error).toLowerCase();
  return ["timed out", "connection reset", "connection refused", "socket hang up"].some((token) => message.includes(token));
}

export async function withDbRetry<T>(
  operation: () => Promise<T>,
  context?: RetryContext
) {
  const operationName = context?.operation ?? "db-op";
  const customRetries = context?.retries;
  const customBaseDelayMs = context?.baseDelayMs;

  if (typeof customRetries === "number") {
    const retries = Math.max(0, customRetries);
    const baseDelayMs = typeof customBaseDelayMs === "number" ? customBaseDelayMs : 150;
    let attempt = 0;

    while (true) {
      try {
        return await operation();
      } catch (error) {
        attempt += 1;
        if (attempt > retries || !isTransientError(error)) throw error;
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await sleep(delay);
      }
    }
  }

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt <= DEFAULT_RETRY_DELAYS_MS.length) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryable = isRetryableDbError(error);
      const canRetry = retryable && attempt < DEFAULT_RETRY_DELAYS_MS.length;
      if (!canRetry) throw error;

      const delay = DEFAULT_RETRY_DELAYS_MS[attempt];
      console.warn(`[db-retry] ${operationName} retry ${attempt + 1}/${DEFAULT_RETRY_DELAYS_MS.length} after ${delay}ms`);
      await sleep(delay);
      attempt += 1;
    }
  }

  throw lastError;
}