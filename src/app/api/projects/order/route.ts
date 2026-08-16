import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!Array.isArray(body.projectIds) || body.projectIds.some((id: unknown) => typeof id !== "string")) {
    return NextResponse.json({ error: "사업 순서 정보가 올바르지 않습니다." }, { status: 400 });
  }

  const projectIds = body.projectIds as string[];
  const projects = await withDbRetry(
    () => prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, members: { where: { userId: session.user.id }, select: { role: true } } } }),
    { operation: "projects:order:access" }
  );
  if (projects.length !== projectIds.length || projects.some((project) => !project.members.length)) {
    return NextResponse.json({ error: "사업 순서를 변경할 권한이 없습니다." }, { status: 403 });
  }

  await withDbRetry(
    () => prisma.$transaction(projectIds.map((id, index) => prisma.project.update({ where: { id }, data: { order: index } }))),
    { operation: "projects:order:update" }
  );
  return NextResponse.json({ ok: true });
}