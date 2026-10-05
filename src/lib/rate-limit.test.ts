import assert from "node:assert/strict";
import test from "node:test";
import { checkRateLimit, resetRateLimitsForTesting } from "./rate-limit";

test("development rate limiting rejects a request after its configured limit", async () => {
  const previous = {
    rateLimitSecret: process.env.RATE_LIMIT_SECRET,
    authSecret: process.env.AUTH_SECRET,
    nextAuthSecret: process.env.NEXTAUTH_SECRET,
    redisUrl: process.env.UPSTASH_REDIS_REST_URL,
    redisToken: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
  delete process.env.RATE_LIMIT_SECRET;
  delete process.env.AUTH_SECRET;
  delete process.env.NEXTAUTH_SECRET;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  resetRateLimitsForTesting();

  try {
    const request = new Request("https://example.test", { headers: { "x-forwarded-for": "192.0.2.1" } });
    assert.equal((await checkRateLimit(request, "test", "192.0.2.1", { limit: 1, window: "1 m" })).allowed, true);
    assert.equal((await checkRateLimit(request, "test", "192.0.2.1", { limit: 1, window: "1 m" })).allowed, false);
  } finally {
    if (previous.rateLimitSecret === undefined) delete process.env.RATE_LIMIT_SECRET; else process.env.RATE_LIMIT_SECRET = previous.rateLimitSecret;
    if (previous.authSecret === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = previous.authSecret;
    if (previous.nextAuthSecret === undefined) delete process.env.NEXTAUTH_SECRET; else process.env.NEXTAUTH_SECRET = previous.nextAuthSecret;
    if (previous.redisUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL; else process.env.UPSTASH_REDIS_REST_URL = previous.redisUrl;
    if (previous.redisToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN; else process.env.UPSTASH_REDIS_REST_TOKEN = previous.redisToken;
    resetRateLimitsForTesting();
  }
});