import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: "이름을 입력해주세요." }, { status: 400 });
    }

    const users = await prisma.user.findMany({
      where: { name: { contains: name.trim() } },
      select: { email: true },
    });

    if (users.length === 0) {
      return NextResponse.json({ error: "해당 이름으로 등록된 계정이 없습니다." }, { status: 404 });
    }

    // Mask email: abc***@example.com
    const masked = users.map(({ email }) => {
      const [local, domain] = email.split("@");
      const visible = local.slice(0, Math.min(3, local.length));
      return `${visible}${"*".repeat(Math.max(0, local.length - 3))}@${domain}`;
    });

    return NextResponse.json({ emails: masked });
  } catch {
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
