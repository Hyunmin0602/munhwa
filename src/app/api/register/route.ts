import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { withDbReadRetry, withDbWrite } from "@/lib/db-retry";
import { checkRateLimit, getClientIp, rateLimitResponse, REGISTRATION_EMAIL_LIMIT, REGISTRATION_IP_LIMIT } from "@/lib/rate-limit";
import { InputValidationError, normalizeEmail, password, readJsonObject, requiredText } from "@/lib/validation";
import { conflict } from "@/lib/api-error";

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

    const cohort = await withDbReadRetry(() => prisma.cohort.findFirst({ where: { id: cohortId, isActive: true } }), { operation: `auth:check-cohort:${cohortId}` });
    if (!cohort) {
      return NextResponse.json({ error: "선택한 기수를 찾을 수 없거나 가입할 수 없습니다." }, { status: 400 });
    }

    const existing = await withDbReadRetry(() => prisma.user.findUnique({ where: { email } }), { operation: `auth:check-user:${email}` });
    if (existing) {
      return conflict("이미 사용 중인 이메일입니다. 로그인하거나 관리자에게 문의해주세요.");
    }

    const hashed = await bcrypt.hash(plainPassword, 10);
    const user = await withDbWrite(() =>
      prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: { name, email, password: hashed, cohortId, registrationStatus: "PENDING" },
          select: { id: true, name: true, email: true, cohortId: true, registrationStatus: true },
        });
        return createdUser;
      })
    );

    return NextResponse.json({ ok: true, pendingApproval: user.registrationStatus === "PENDING" }, { status: 201 });
  } catch (error) {
    if (error instanceof InputValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
