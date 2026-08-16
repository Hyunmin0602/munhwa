import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";

export async function GET() {
  try {
    const cohorts = await withDbRetry(
      () => prisma.cohort.findMany({ where: { isActive: true }, orderBy: [{ order: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
      { operation: "cohorts:list-active" }
    );
    return NextResponse.json(cohorts);
  } catch (error) {
    console.error("[api/cohorts] GET failed", error);
    return NextResponse.json({ error: "기수 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}