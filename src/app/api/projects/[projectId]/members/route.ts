import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { assertProjectMember, assertProjectOwner, findUserByEmail } from "@/lib/server-utils";
import { withDbRetry } from "@/lib/db-retry";

function logApiError(action: string, error: unknown) {
  console.error(`[api/projects/:projectId/members] ${action} failed`, error);
}

type Params = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { projectId } = await params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;
    if (!(await assertProjectMember(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const canManage = await assertProjectOwner(userId, projectId);

    const query = request.nextUrl.searchParams.get("query")?.trim();
    if (query) {
      if (!canManage) return NextResponse.json({ error: "사업 소유자만 사용자를 검색할 수 있습니다." }, { status: 403 });
      const users = await withDbRetry(() =>
        prisma.user.findMany({
          where: { OR: [{ name: { contains: query } }, { email: { contains: query } }] },
          select: { id: true, name: true, email: true },
          take: 10,
        })
      );
      return NextResponse.json({ users });
    }

    const members = await withDbRetry(() =>
      prisma.projectMember.findMany({ where: { projectId }, include: { user: { select: { id: true, name: true, email: true } } } })
    );
    return NextResponse.json(members, { headers: { "X-Project-Can-Manage-Members": String(canManage) } });
  } catch (error) {
    logApiError("GET", error);
    return NextResponse.json({ error: "멤버 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { projectId } = await params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;
    if (!(await assertProjectOwner(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { email, userId: requestedUserId, role } = await req.json();
    if (!email && !requestedUserId) return NextResponse.json({ error: "추가할 사용자가 필요합니다." }, { status: 400 });

    const user = await withDbRetry(() => requestedUserId
      ? prisma.user.findUnique({ where: { id: requestedUserId } })
      : findUserByEmail(email));
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // prevent duplicate
    const exists = await withDbRetry(() => prisma.projectMember.findUnique({ where: { userId_projectId: { userId: user.id, projectId } } }));
    if (exists) return NextResponse.json({ error: "Already a member" }, { status: 409 });

    const member = await withDbRetry(() => prisma.projectMember.create({ data: { userId: user.id, projectId, role: role ?? "member" }, include: { user: { select: { id: true, name: true, email: true } } } }));
    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    logApiError("POST", error);
    return NextResponse.json({ error: "멤버 추가에 실패했습니다." }, { status: 500 });
  }
}
