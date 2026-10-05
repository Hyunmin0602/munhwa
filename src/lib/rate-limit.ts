import { createHmac } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type LimitRule = {
  limit: number;
  window: `${number} ${"s" | "m" | "h" | "d"}`;
};

type LimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  unavailable: boolean;
};

const localLimits = new Map<string, { count: number; resetAt: number }>();
const redisLimiters = new Map<string, Ratelimit>();

export function resetRateLimitsForTesting() {
  localLimits.clear();
  redisLimiters.clear();
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function rateLimitSecret() {
  return process.env.RATE_LIMIT_SECRET ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
}

function parseWindowMilliseconds(window: LimitRule["window"]) {
  const [value, unit] = window.split(" ");
  const multiplier = unit === "s" ? 1_000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return Number(value) * multiplier;
}

function getLimiter(rule: LimitRule, namespace: string) {
  const key = `${namespace}:${rule.limit}:${rule.window}`;
  const existing = redisLimiters.get(key);
  if (existing) return existing;

  const limiter = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(rule.limit, rule.window),
    prefix: `munhwa:${namespace}`,
  });
  redisLimiters.set(key, limiter);
  return limiter;
}

function hashIdentifier(namespace: string, identifier: string) {
  const secret = rateLimitSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(`${namespace}:${identifier}`).digest("hex");
}

function getLocalLimit(key: string, rule: LimitRule): LimitResult {
  const now = Date.now();
  const windowMs = parseWindowMilliseconds(rule.window);
  const current = localLimits.get(key);
  if (!current || current.resetAt <= now) {
    localLimits.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: Math.ceil(windowMs / 1_000), unavailable: false };
  }

  current.count += 1;
  return {
    allowed: current.count <= rule.limit,
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)),
    unavailable: false,
  };
}

export function getClientIp(request: Pick<Request, "headers">) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export async function checkRateLimit(request: Pick<Request, "headers">, namespace: string, identifier: string, rule: LimitRule): Promise<LimitResult> {
  const hashedIdentifier = hashIdentifier(namespace, identifier);
  if (!hashedIdentifier) {
    if (isProduction()) return { allowed: false, retryAfterSeconds: 60, unavailable: true };
    return getLocalLimit(`${namespace}:${identifier}`, rule);
  }

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    if (isProduction()) return { allowed: false, retryAfterSeconds: 60, unavailable: true };
    return getLocalLimit(`${namespace}:${hashedIdentifier}`, rule);
  }

  try {
    const result = await getLimiter(rule, namespace).limit(hashedIdentifier);
    return {
      allowed: result.success,
      retryAfterSeconds: Math.max(1, Math.ceil((result.reset - Date.now()) / 1_000)),
      unavailable: false,
    };
  } catch {
    return { allowed: false, retryAfterSeconds: 60, unavailable: true };
  }
}

export function rateLimitResponse(result: LimitResult) {
  const status = result.unavailable ? 503 : 429;
  const error = result.unavailable ? "요청 보호 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해주세요." : "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
  return Response.json(
    { error },
    { status, headers: { "Cache-Control": "no-store", "Retry-After": String(result.retryAfterSeconds) } }
  );
}

export const LOGIN_IP_LIMIT: LimitRule = { limit: 10, window: "10 m" };
export const LOGIN_EMAIL_LIMIT: LimitRule = { limit: 5, window: "10 m" };
export const REGISTRATION_IP_LIMIT: LimitRule = { limit: 5, window: "1 h" };
export const REGISTRATION_EMAIL_LIMIT: LimitRule = { limit: 3, window: "1 d" };