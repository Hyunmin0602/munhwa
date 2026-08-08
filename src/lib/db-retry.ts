function isTransientError(err: unknown) {
  if (!err) return false;
  const maybeErr = err as { message?: unknown; code?: unknown };
  const msg = String(maybeErr.message ?? "").toLowerCase();
  const code = maybeErr.code ?? "";
  if (typeof code === "string" && ["econnreset", "etimedout", "econnrefused", "enotfound"].includes(code.toLowerCase())) return true;
  if (msg.includes("timed out") || msg.includes("connection reset") || msg.includes("connection refused") || msg.includes("socket hang up")) return true;
  return false;
}

export async function withDbRetry<T>(
  operation: () => Promise<T>,
  opts?: { retries?: number; baseDelayMs?: number } | RetryContext
) {
  // If caller passed a RetryContext with `operation`, use the retry schedule configured by RETRY_DELAYS_MS
  if (opts && typeof (opts as RetryContext).operation === "string") {
    const context = opts as RetryContext;
    let attempt = 0;
    let lastError: unknown = null;

    while (attempt <= RETRY_DELAYS_MS.length) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        const retryable = isRetryableDbError(error);
        const canRetry = retryable && attempt < RETRY_DELAYS_MS.length;

        if (!canRetry) {
          throw error;
        }

        const delay = RETRY_DELAYS_MS[attempt];
        console.warn(`[db-retry] ${context.operation} retry ${attempt + 1}/${RETRY_DELAYS_MS.length} after ${delay}ms`);
        await sleep(delay);
        attempt += 1;
      }
    }

    throw lastError;
  }

  // Fallback simple exponential-backoff for callers that provided { retries, baseDelayMs } or nothing
  const simpleOpts = (opts as { retries?: number; baseDelayMs?: number } | undefined) ?? {};
  const retries = simpleOpts.retries ?? 2;
  const base = simpleOpts.baseDelayMs ?? 150;
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (err) {
      attempt++;
      if (attempt > retries || !isTransientError(err)) throw err;
      const delay = base * Math.pow(2, attempt - 1);
      await new Promise((res) => setTimeout(res, delay));
    }
  }
}
type RetryContext = {
  operation: string;
};

const RETRY_DELAYS_MS = [150, 400];

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

  if (code && /^P2\d{3}$/.test(code)) {
    return false;
  }

  const message = getErrorMessage(error);
  return RETRYABLE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

// Note: single `withDbRetry` implementation above supports both simple opts and `RetryContext`.