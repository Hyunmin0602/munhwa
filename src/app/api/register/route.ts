import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";
import { checkRateLimit, getClientIp, rateLimitResponse, REGISTRATION_EMAIL_LIMIT, REGISTRATION_IP_LIMIT } from "@/lib/rate-limit";
import { InputValidationError, normalizeEmail, password, readJsonObject, requiredText } from "@/lib/validation";

export async function POST(req: NextRequest) {
  try {
    const data = await readJsonObject(req);
    const name = requiredText(data.name, "이름", 50);
    const email = normalizeEmail(data.email);
    const plainPassword = password(data.password);
    const cohortId = requiredText(data.cohortId, "기수", 64);

    const ipLimit = await checkRateLimit(req, "registration-ip", getClientIp(req), REGISTRATION_IP_LIMIT);
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit);
    const emailLimit = await checkRateLimit(req, "registration-email", email, REGISTRATION_EMAIL_LIMIT);
    if (!emailLimit.allowed) return rateLimitResponse(emailLimit);

    const cohort = await withDbRetry(() => prisma.cohort.findFirst({ where: { id: cohortId, isActive: true } }), { operation: `auth:check-cohort:${cohortId}` });
    if (!cohort) {
      return NextResponse.json({ error: "선택한 기수를 찾을 수 없거나 가입할 수 없습니다." }, { status: 400 });
    }

    const existing = await withDbRetry(() => prisma.user.findUnique({ where: { email } }), { operation: `auth:check-user:${email}` });
    if (existing) {
      return NextResponse.json({ ok: true }, { status: 201 });
    }

    const hashed = await bcrypt.hash(plainPassword, 10);
    const user = await withDbRetry(
      () =>
        prisma.user.create({ data: { name, email, password: hashed, cohortId }, select: { id: true, name: true, email: true, cohortId: true } }),
      { operation: `auth:create-user:${email}` }
    );

    return NextResponse.json({ ok: true, user }, { status: 201 });
  } catch (error) {
    if (error instanceof InputValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
