import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";

export async function POST(req: NextRequest) {
  try {
    const { name, email, password, cohortId } = await req.json();

    if (!name || !email || !password || !cohortId) {
      return NextResponse.json({ error: "모든 필드를 입력해주세요." }, { status: 400 });
    }

    const cohort = await withDbRetry(() => prisma.cohort.findFirst({ where: { id: cohortId, isActive: true } }), { operation: `auth:check-cohort:${cohortId}` });
    if (!cohort) {
      return NextResponse.json({ error: "선택한 기수를 찾을 수 없거나 가입할 수 없습니다." }, { status: 400 });
    }

    const existing = await withDbRetry(() => prisma.user.findUnique({ where: { email } }), { operation: `auth:check-user:${email}` });
    if (existing) {
      return NextResponse.json({ error: "이미 사용 중인 이메일입니다." }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await withDbRetry(
      () =>
        prisma.user.create({ data: { name, email, password: hashed, cohortId }, select: { id: true, name: true, email: true, cohortId: true } }),
      { operation: `auth:create-user:${email}` }
    );

    return NextResponse.json(user, { status: 201 });
  } catch {
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
