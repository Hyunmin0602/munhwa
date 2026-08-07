function isTransientError(err: unknown) {
  const e: any = err;
  if (!e) return false;
  const msg = (e.message || "").toString().toLowerCase();
  const code = e.code || "";
  if (typeof code === "string" && ["econnreset", "etimedout", "econnrefused", "enotfound"].includes(code.toLowerCase())) return true;
  if (msg.includes("timed out") || msg.includes("connection reset") || msg.includes("connection refused") || msg.includes("socket hang up")) return true;
  return false;
}

export async function withDbRetry<T>(fn: () => Promise<T>, opts?: { retries?: number; baseDelayMs?: number }) {
  const retries = opts?.retries ?? 2;
  const base = opts?.baseDelayMs ?? 150;
  let attempt = 0;
  while (true) {
    try {
      return await fn();
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

export async function withDbRetry<T>(
  operation: () => Promise<T>,
  context: RetryContext
) {
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
      console.warn(
        `[db-retry] ${context.operation} retry ${attempt + 1}/${RETRY_DELAYS_MS.length} after ${delay}ms`
      );
      await sleep(delay);
      attempt += 1;
    }
  }

  throw lastError;
}