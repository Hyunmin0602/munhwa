import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    // Quick DB sanity check to detect connection issues
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      console.error("[session-check] DB error", err);
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[session-check] error", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
