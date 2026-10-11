import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { assertProjectMember, assertProjectOwner, canManageProject, recordActivity } from "@/lib/server-utils";
import { withDbReadRetry, withDbWrite } from "@/lib/db-retry";
import { conflict, forbidden, internalError, notFound, unauthorized, validationError } from "@/lib/api-error";
import { InputValidationError, normalizeEmail, readJsonObject, requiredText } from "@/lib/validation";

function logApiError(action: string, error: unknown) {
  console.error(`[api/projects/:projectId/members] ${action} failed`, error);
}

type Params = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { projectId } = await params;
    const session = await auth();
    if (!session?.user?.id) return unauthorized();
    const userId = session.user.id;
    if (!(await assertProjectMember(userId, projectId))) return forbidden();
    const canManage = (await assertProjectOwner(userId, projectId)) || (await canManageProject(userId, projectId));

    const query = request.nextUrl.searchParams.get("query")?.trim();
    if (query) {
      if (!canManage) return forbidden("사업 관리자만 사용자를 검색할 수 있습니다.");
      const project = await withDbReadRetry(() => prisma.project.findUnique({
        where: { id: projectId }, select: { spaceId: true, space: { select: { adminUserId: true } } },
      }));
      if (!project) return notFound("사업을 찾을 수 없습니다.");
      if (!project.spaceId) return conflict("사업의 Space 설정을 먼저 확인해주세요.");
      const spaceId = project.spaceId;
      const users = await withDbReadRetry(() =>
        prisma.user.findMany({
          where: {
            registrationStatus: "APPROVED",
            OR: [{ name: { contains: query } }, { email: { contains: query } }],
            AND: [{ OR: [
              { spaceMemberships: { some: { spaceId } } },
              ...(project.space ? [{ id: project.space.adminUserId }] : []),
            ] }],
          },
          select: { id: true, name: true, email: true },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          take: 10,
        })
      );
      return NextResponse.json({ users });
    }

    const members = await withDbReadRetry(() =>
      prisma.projectMember.findMany({ where: { projectId }, include: { user: { select: { id: true, name: true, email: true } } } })
    );
    return NextResponse.json(members, { headers: { "X-Project-Can-Manage-Members": String(canManage) } });
  } catch (error) {
    logApiError("GET", error);
    return internalError("구성원 목록을 불러오지 못했습니다.");
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { projectId } = await params;
    const session = await auth();
    if (!session?.user?.id) return unauthorized();
    const userId = session.user.id;
    const canManage = (await assertProjectOwner(userId, projectId)) || (await canManageProject(userId, projectId));
    if (!canManage) return forbidden();

    const project = await withDbReadRetry(() => prisma.project.findUnique({
      where: { id: projectId }, select: { spaceId: true, isArchived: true, space: { select: { adminUserId: true } } },
    }));
    if (!project) return notFound("사업을 찾을 수 없습니다.");
    if (project.isArchived) return conflict("기록용 사업에는 구성원을 추가할 수 없습니다. 먼저 진행 사업으로 복원해주세요.");
    if (!project.spaceId) return conflict("사업의 Space 설정을 먼저 확인해주세요.");
    const spaceId = project.spaceId;

    const data = await readJsonObject(req);
    const requestedUserId = data.userId === undefined ? undefined : requiredText(data.userId, "사용자 ID", 200);
    const email = requestedUserId === undefined ? normalizeEmail(data.email) : undefined;
    const role = data.role ?? "member";
    if (role !== "member" && role !== "viewer") return validationError("구성원 역할은 member 또는 viewer여야 합니다.");

    const user = await withDbReadRetry(() => prisma.user.findUnique({
      where: requestedUserId ? { id: requestedUserId } : { email },
      select: { id: true, registrationStatus: true, spaceMemberships: { where: { spaceId }, select: { id: true }, take: 1 } },
    }));
    if (!user) return notFound("사용자를 찾을 수 없습니다.");
    if (user.registrationStatus !== "APPROVED" || (!user.spaceMemberships.length && project.space?.adminUserId !== user.id)) {
      return forbidden("해당 Space의 승인된 구성원만 추가할 수 있습니다.");
    }

    // prevent duplicate
    const exists = await withDbReadRetry(() => prisma.projectMember.findUnique({ where: { userId_projectId: { userId: user.id, projectId } }, select: { id: true } }));
    if (exists) return conflict("이미 사업에 추가된 구성원입니다.");

    const member = await withDbWrite(() => prisma.projectMember.create({ data: { userId: user.id, projectId, role }, include: { user: { select: { id: true, name: true, email: true } } } }));
    await recordActivity({ actorId: userId, projectId, type: "구성원", action: "추가", entityType: "PROJECT_MEMBER", entityId: member.id, title: member.user.name ?? "사업 구성원", afterData: { userId: member.userId, role: member.role } });
    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    if (error instanceof InputValidationError) return validationError(error.message);
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return conflict("이미 사업에 추가된 구성원입니다.");
    logApiError("POST", error);
    return internalError("구성원 추가에 실패했습니다.");
  }
}
