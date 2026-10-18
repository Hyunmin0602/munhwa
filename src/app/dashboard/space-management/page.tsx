"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { apiFetch } from "@/lib/client-fetch";
import ModalFrame, { ModalCloseButton } from "@/components/ui/ModalFrame";
import ActivityLogPanel from "@/components/ActivityLogPanel";

type Tab = "department" | "members" | "projects" | "logs";
type Cohort = { id: string; name: string; isActive: boolean; order: number; _count: { users: number } };
type User = { id: string; name: string | null; email: string; role?: string };
type Member = { id: string; role: string; joinedAt: string; user: User & { cohort: { id: string; name: string } | null; projects: Array<{ role: string; project: { id: string; name: string } }> } };
type RegistrationRequest = { id: string; name: string | null; email: string; createdAt: string; cohort: { name: string } | null };
type ProjectMember = { id: string; role: string; user: User };
type Project = { id: string; name: string; description: string | null; status: string; isArchived: boolean; accessScope: "SPACE" | "MEMBERS"; updatedAt: string; owner: User | null; members: ProjectMember[]; _count: { members: number; archivePosts: number; events: number; columns: number } };
type UserSearchResult = { id: string; name: string | null; email: string };

const tabs: Array<[Tab, string]> = [["department", "부서 관리"], ["members", "구성원 관리"], ["projects", "사업 관리"], ["logs", "로그 관리"]];

function displayName(user: User | null) { return user?.name?.trim() || user?.email || "미지정"; }
async function errorMessage(response: Response, fallback: string) { const payload = await response.json().catch(() => null); return payload?.error?.message ?? payload?.error ?? fallback; }

export default function SpaceManagementPage() {
  const [tab, setTab] = useState<Tab>("department");
  const [spaceName, setSpaceName] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberNextCursor, setMemberNextCursor] = useState<string | null>(null);
  const [memberCohortFilter, setMemberCohortFilter] = useState("all");
  const [pendingRegistrations, setPendingRegistrations] = useState<RegistrationRequest[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [query, setQuery] = useState("");
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const memberRequestId = useRef(0);
  const memberNextCursorRef = useRef<string | null>(null);
  const [memberAddProject, setMemberAddProject] = useState<Project | null>(null);
  const [memberAddQuery, setMemberAddQuery] = useState("");
  const [memberAddResults, setMemberAddResults] = useState<UserSearchResult[]>([]);
  const [memberAddLoading, setMemberAddLoading] = useState(false);
  const [memberAddSubmitting, setMemberAddSubmitting] = useState(false);
  const [memberAddSearched, setMemberAddSearched] = useState(false);
  const [memberAddError, setMemberAddError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    const response = await apiFetch("/api/space-management/settings", undefined, { showGlobalError: false });
    if (!response.ok) throw new Error(await errorMessage(response, "부서 설정을 불러오지 못했습니다."));
    const payload = await response.json();
    setSpaceName(payload.space?.name ?? "");
    setNameDraft(payload.space?.name ?? "");
    setCohorts(Array.isArray(payload.cohorts) ? payload.cohorts : []);
  }, []);

  const loadMembers = useCallback(async (append = false) => {
    const requestId = ++memberRequestId.current;
    const params = new URLSearchParams({ limit: "30" });
    if (memberSearchQuery.trim()) params.set("query", memberSearchQuery.trim());
    if (memberCohortFilter !== "all") params.set("cohortId", memberCohortFilter);
    if (append && memberNextCursorRef.current) params.set("cursor", memberNextCursorRef.current);
    const url = `/api/space-management/members?${params.toString()}`;
    const response = await apiFetch(url, undefined, { showGlobalError: false });
    if (!response.ok) throw new Error(await errorMessage(response, "구성원 목록을 불러오지 못했습니다."));
    const payload = await response.json();
    if (requestId !== memberRequestId.current) return;
    setMembers((current) => append ? [...current, ...(Array.isArray(payload.items) ? payload.items : [])] : (Array.isArray(payload.items) ? payload.items : []));
    setPendingRegistrations(Array.isArray(payload.pendingRegistrations) ? payload.pendingRegistrations : []);
    const nextCursor = typeof payload.nextCursor === "string" ? payload.nextCursor : null;
    memberNextCursorRef.current = nextCursor;
    setMemberNextCursor(nextCursor);
  }, [memberCohortFilter, memberSearchQuery]);

  const loadProjects = useCallback(async () => {
    const response = await apiFetch("/api/space-management/projects", undefined, { showGlobalError: false });
    if (!response.ok) throw new Error(await errorMessage(response, "사업 목록을 불러오지 못했습니다."));
    const payload = await response.json();
    setProjects(Array.isArray(payload.items) ? payload.items : []);
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      if (tab === "department") await loadSettings();
      if (tab === "members") await Promise.all([loadMembers(), loadSettings()]);
      if (tab === "projects") await loadProjects();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "관리자 설정을 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, [loadMembers, loadProjects, loadSettings, tab]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => setMemberSearchQuery(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const run = async (key: string, action: () => Promise<void>) => {
    setWorking(key); setError(null); setNotice(null);
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "저장하지 못했습니다."); }
    finally { setWorking(null); }
  };

  const saveSpaceName = () => run("space-name", async () => {
    const response = await apiFetch("/api/space-management/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nameDraft }) }, { showGlobalError: false });
    if (!response.ok) throw new Error(await errorMessage(response, "부서 이름을 저장하지 못했습니다."));
    const space = await response.json(); setSpaceName(space.name); setNameDraft(space.name); setNotice("부서 이름을 저장했습니다.");
  });

  const addCohort = () => run("cohort-add", async () => {
    const name = window.prompt("새 기수 이름을 입력하세요."); if (!name?.trim()) return;
    const response = await apiFetch("/api/space-management/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) }, { showGlobalError: false });
    if (!response.ok) throw new Error(await errorMessage(response, "기수를 추가하지 못했습니다."));
    await loadSettings(); setNotice("기수를 추가했습니다.");
  });

  const toggleCohort = (cohort: Cohort) => run(`cohort-${cohort.id}`, async () => {
    const response = await apiFetch(`/api/space-management/settings/${cohort.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !cohort.isActive }) }, { showGlobalError: false });
    if (!response.ok) throw new Error(await errorMessage(response, "기수 상태를 변경하지 못했습니다."));
    await loadSettings();
  });

  const updateRole = (member: Member, role: "member" | "space_manager") => run(`member-${member.user.id}`, async () => {
    const response = await apiFetch("/api/space-management/members", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: member.user.id, role }) }, { showGlobalError: false });
    if (!response.ok) throw new Error(await errorMessage(response, "역할을 변경하지 못했습니다."));
    await loadMembers(); setNotice(`${displayName(member.user)}의 역할을 변경했습니다.`);
  });

  const reviewRegistration = (request: RegistrationRequest, registrationAction: "approve" | "reject") => run(`registration-${request.id}`, async () => {
    const decision = registrationAction === "approve" ? "승인" : "반려";
    if (registrationAction === "reject" && !window.confirm(`${displayName(request)}님의 가입 신청을 반려하고 신청 계정을 삭제할까요?`)) return;
    const response = await apiFetch("/api/space-management/members", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: request.id, registrationAction }) }, { showGlobalError: false });
    if (!response.ok) throw new Error(await errorMessage(response, `가입 신청을 ${decision}하지 못했습니다.`));
    await loadMembers();
    setNotice(`${displayName(request)}님의 가입 신청을 ${decision}했습니다.`);
  });

  const deleteProject = (project: Project) => run(`delete-${project.id}`, async () => {
    if (!window.confirm(`'${project.name}' 사업을 삭제하시겠습니까?`)) return;
    const response = await apiFetch(`/api/projects/${project.id}`, { method: "DELETE" }, { showGlobalError: false });
    if (!response.ok) throw new Error(await errorMessage(response, "사업을 삭제하지 못했습니다."));
    await loadProjects(); setNotice("사업을 삭제했습니다.");
  });

  const renameProject = (project: Project) => run(`rename-${project.id}`, async () => {
    const name = window.prompt("사업 이름", project.name); if (!name?.trim() || name.trim() === project.name) return;
    const response = await apiFetch(`/api/projects/${project.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) }, { showGlobalError: false });
    if (!response.ok) throw new Error(await errorMessage(response, "사업을 변경하지 못했습니다."));
    await loadProjects(); setNotice("사업 이름을 변경했습니다.");
  });

  const toggleProjectArchive = (project: Project) => run(`archive-${project.id}`, async () => {
    const isArchived = !project.isArchived;
    const response = await apiFetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isArchived }),
    }, { showGlobalError: false });
    if (!response.ok) throw new Error(await errorMessage(response, "사업 기록 설정을 변경하지 못했습니다."));
    await loadProjects(); setNotice(isArchived ? "사업을 기록용으로 보관했습니다." : "사업을 진행 중으로 복원했습니다.");
  });

  const updateProjectAccessScope = (project: Project, accessScope: "SPACE" | "MEMBERS") => run(`scope-${project.id}`, async () => {
    const response = await apiFetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessScope }),
    }, { showGlobalError: false });
    if (!response.ok) throw new Error(await errorMessage(response, "사업 열람 범위를 변경하지 못했습니다."));
    await loadProjects(); setNotice(accessScope === "SPACE" ? "Space 구성원 전체가 열람할 수 있습니다." : "지정된 사업 구성원만 열람할 수 있습니다.");
  });

  const openProjectMemberModal = (project: Project) => {
    setMemberAddProject(project);
    setMemberAddQuery("");
    setMemberAddResults([]);
    setMemberAddSearched(false);
    setMemberAddError(null);
  };

  const closeProjectMemberModal = () => {
    setMemberAddProject(null);
    setMemberAddQuery("");
    setMemberAddResults([]);
    setMemberAddSearched(false);
    setMemberAddError(null);
  };

  const searchProjectMembers = async () => {
    if (!memberAddProject) return;
    const queryText = memberAddQuery.trim();
    setMemberAddLoading(true);
    setMemberAddSearched(true);
    setMemberAddError(null);
    try {
      if (!queryText) {
        setMemberAddResults([]);
        return;
      }
      const response = await apiFetch(`/api/projects/${memberAddProject.id}/members?query=${encodeURIComponent(queryText)}`, undefined, { showGlobalError: false });
      if (!response.ok) throw new Error(await errorMessage(response, "사용자를 검색하지 못했습니다."));
      const payload = await response.json();
      setMemberAddResults(Array.isArray(payload.users) ? payload.users : []);
    } catch (cause) {
      setMemberAddError(cause instanceof Error ? cause.message : "사용자를 검색하지 못했습니다.");
      setMemberAddResults([]);
    } finally {
      setMemberAddLoading(false);
    }
  };

  const addProjectMember = (user: UserSearchResult) => run(`add-member-${user.id}`, async () => {
    if (!memberAddProject) return;
    setMemberAddSubmitting(true);
    const response = await apiFetch(
      `/api/projects/${memberAddProject.id}/members`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: user.id }) },
      { showGlobalError: false }
    );
    if (!response.ok) throw new Error(await errorMessage(response, "사업 구성원을 추가하지 못했습니다."));
    await loadProjects();
    setNotice("사업 구성원을 추가했습니다.");
    closeProjectMemberModal();
    setMemberAddSubmitting(false);
  });

  const removeProjectMember = (project: Project, member: ProjectMember) => run(`remove-member-${member.id}`, async () => {
    if (!window.confirm(`${displayName(member.user)}님을 사업에서 제거하시겠습니까?`)) return;
    const response = await apiFetch(`/api/projects/${project.id}/members/${member.id}`, { method: "DELETE" }, { showGlobalError: false });
    if (!response.ok) throw new Error(await errorMessage(response, "사업 구성원을 제거하지 못했습니다."));
    await loadProjects(); setNotice("사업 구성원을 제거했습니다.");
  });

  return <main className="space-management-page h-auto min-h-full overflow-visible bg-slate-50 px-3 py-4 pb-24 md:px-6 md:py-6 lg:h-full lg:overflow-y-auto lg:pb-6"><div className="mx-auto max-w-7xl">
    <header className="border-b border-slate-200 pb-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">공간 운영</p><h1 className="mt-1 text-xl font-bold tracking-tight text-slate-950 md:text-2xl">공간 설정</h1><p className="mt-1 text-sm text-slate-500">{spaceName || "현재 공간"}의 구성원과 운영 정보를 관리합니다.</p></header>
    <div className="mt-5 flex flex-col gap-5">
      <nav className="space-management-tabs flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="공간 설정 메뉴">{tabs.map(([value, text]) => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)} className={`whitespace-nowrap border-b-2 border-transparent px-4 py-3 text-sm font-semibold ${tab === value ? "text-indigo-600" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}>{text}</button>)}</nav>
      <section className="min-w-0">{error && <div className="mb-4 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}{notice && <div className="mb-4 border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>}
        {loading && tab !== "logs" && !(tab === "members" && members.length > 0) ? <div className="border border-slate-200 bg-white px-4 py-16 text-center text-sm text-slate-400">불러오는 중...</div> : <>
          {tab === "department" && <div className="space-y-4"><section className="border border-slate-200 bg-white"><div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-bold text-slate-900">부서 기본 설정</h2><p className="mt-1 text-xs text-slate-500">좌측 상단 부서명과 회원가입 기수에 반영됩니다.</p></div><div className="flex flex-col gap-2 px-4 py-3 sm:flex-row"><input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} className="min-w-0 flex-1 border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500" /><button type="button" onClick={() => void saveSpaceName()} disabled={working === "space-name"} className="border border-indigo-600 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">저장</button></div></section><section className="border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div><h2 className="text-sm font-bold text-slate-900">기수 설정</h2><p className="mt-1 text-xs text-slate-500">회원가입 화면에는 활성 기수만 표시됩니다.</p></div><button type="button" onClick={() => void addCohort()} className="border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">기수 추가</button></div><div className="divide-y divide-slate-100">{cohorts.map((cohort) => <div key={cohort.id} className="grid gap-2 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_6rem_5rem] sm:items-center"><span className="text-sm text-slate-800">{cohort.name}</span><span className="text-xs text-slate-400">가입자 {cohort._count.users}명</span><button type="button" onClick={() => void toggleCohort(cohort)} disabled={working === `cohort-${cohort.id}`} className={`px-2 py-1 text-xs font-semibold ${cohort.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{cohort.isActive ? "활성" : "비활성"}</button></div>)}{cohorts.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-400">등록된 기수가 없습니다.</p>}</div></section></div>}
          {tab === "members" && <div className="space-y-4">
            <section className="border border-amber-200 bg-white">
              <div className="flex items-center justify-between border-b border-amber-100 bg-amber-50 px-4 py-3"><div><h2 className="text-sm font-bold text-slate-900">가입 승인 대기</h2><p className="mt-1 text-xs text-slate-500">승인된 계정만 부서 구성원으로 등록되고 로그인할 수 있습니다.</p></div><span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-amber-700">{pendingRegistrations.length}명</span></div>
              <div className="divide-y divide-slate-100">{pendingRegistrations.map((request) => <div key={request.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{displayName(request)}</p><p className="truncate text-xs text-slate-500">{request.email} · {request.cohort?.name ?? "기수 미지정"}</p><p className="mt-1 text-[11px] text-slate-400">신청 {new Date(request.createdAt).toLocaleDateString("ko-KR")}</p></div><div className="flex gap-2"><button type="button" onClick={() => void reviewRegistration(request, "reject")} disabled={working === `registration-${request.id}`} className="min-h-10 flex-1 border border-slate-200 px-4 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 sm:flex-none">반려</button><button type="button" onClick={() => void reviewRegistration(request, "approve")} disabled={working === `registration-${request.id}`} className="min-h-10 flex-1 bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 sm:flex-none">승인</button></div></div>)}{pendingRegistrations.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-400">승인 대기 중인 가입 신청이 없습니다.</p>}</div>
            </section>
            <section className="border border-slate-200 bg-white"><div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-3 py-2"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름 또는 이메일 검색" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /><select value={memberCohortFilter} onChange={(event) => setMemberCohortFilter(event.target.value)} aria-label="기수별 검색" className="rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"><option value="all">전체 기수</option><option value="unassigned">기수 미지정</option>{cohorts.map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.name}</option>)}</select><span className="text-xs tabular-nums text-slate-400">{members.length}명</span></div><div className="overflow-x-auto"><div className="grid min-w-[48rem] grid-cols-[minmax(15rem,1fr)_8rem_10rem_12rem] bg-slate-50 px-4 py-2 text-[11px] font-semibold text-slate-400"><span>기본 정보</span><span>기수</span><span>역할</span><span>참여 사업</span></div>{members.map((member) => <div key={member.id} className="grid min-w-[48rem] grid-cols-[minmax(15rem,1fr)_8rem_10rem_12rem] items-center border-t border-slate-100 px-4 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{displayName(member.user)}</p><p className="truncate text-xs text-slate-500">{member.user.email}</p></div><span className="truncate text-xs text-slate-500">{member.user.cohort?.name ?? "미지정"}</span><select value={member.role === "space_manager" ? "space_manager" : "member"} onChange={(event) => void updateRole(member, event.target.value as "member" | "space_manager")} disabled={working === `member-${member.user.id}`} className="mr-3 rounded border border-slate-200 px-2 py-1.5 text-xs"><option value="member">멤버</option><option value="space_manager">관리자</option></select><span className="truncate text-xs text-slate-600">{member.user.projects.length ? member.user.projects.map((item) => item.project.name).join(", ") : "참여 사업 없음"}</span></div>)}</div>{memberNextCursor && <div className="border-t border-slate-100 p-3 text-center"><button type="button" disabled={loading} onClick={() => void loadMembers(true)} className="px-4 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50">더 불러오기</button></div>}</section>
          </div>}
          {tab === "projects" && <section className="space-y-3">{projects.map((project) => <article key={project.id} className="border border-slate-200 bg-white"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3"><div className="min-w-0"><div className="flex items-center gap-2"><h2 className="truncate text-sm font-bold text-slate-900">{project.name}</h2>{project.isArchived && <span className="shrink-0 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">기록용</span>}</div><p className="mt-1 text-xs text-slate-500">관리자 {displayName(project.owner)} · 구성원 {project._count.members}명 · 문서 {project._count.archivePosts}개 · 일정 {project._count.events}개</p></div><div className="flex flex-wrap gap-1"><button type="button" onClick={() => void toggleProjectArchive(project)} disabled={working === `archive-${project.id}`} className="border border-indigo-200 px-2.5 py-1.5 text-xs font-semibold text-indigo-700">{project.isArchived ? "진행 사업으로 복원" : "기록용으로 보관"}</button><button type="button" onClick={() => void renameProject(project)} className="border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600">이름 변경</button><button type="button" onClick={() => void deleteProject(project)} disabled={project.isArchived || working === `delete-${project.id}`} className="border border-rose-200 px-2.5 py-1.5 text-xs text-rose-600 disabled:opacity-40">삭제</button></div></div>{project.isArchived && <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2.5"><label className="text-xs font-semibold text-slate-600" htmlFor={`project-access-${project.id}`}>열람 범위</label><select id={`project-access-${project.id}`} value={project.accessScope} onChange={(event) => void updateProjectAccessScope(project, event.target.value as "SPACE" | "MEMBERS")} disabled={working === `scope-${project.id}`} className="border border-slate-200 bg-white px-2 py-1.5 text-xs"><option value="SPACE">Space 구성원 전체</option><option value="MEMBERS">지정된 사업 구성원만</option></select><span className="text-xs text-slate-500">기록용 사업은 내용을 수정할 수 없습니다.</span></div>}<div className="flex flex-wrap items-center gap-2 px-4 py-2.5"><span className="text-xs font-semibold text-slate-500">사업 구성원</span>{project.members.map((member) => <span key={member.id} className="inline-flex items-center gap-1 border border-slate-200 px-2 py-1 text-xs text-slate-600">{displayName(member.user)}<button type="button" onClick={() => void removeProjectMember(project, member)} className="text-rose-500" aria-label={`${displayName(member.user)} 제거`}>×</button></span>)}<button type="button" onClick={() => openProjectMemberModal(project)} className="border border-dashed border-indigo-300 px-2 py-1 text-xs font-semibold text-indigo-600">+ 인원 추가</button></div></article>)}{projects.length === 0 && <div className="border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-400">등록된 사업이 없습니다.</div>}</section>}
          {tab === "logs" && <ActivityLogPanel />}
        </>}
      </section>
    </div>
    {memberAddProject && <ModalFrame title="사업 인원 추가" onClose={closeProjectMemberModal} className="max-w-2xl p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">사업 인원 추가</h2>
          <p className="mt-1 text-sm text-slate-500">이미 가입된 사용자 중에서 검색해 추가합니다.</p>
        </div>
        <ModalCloseButton label="사업 인원 추가 닫기" onClick={closeProjectMemberModal} />
      </div>
      <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-xs font-semibold text-slate-500">대상 사업</p>
        <p className="mt-1 text-sm font-semibold text-slate-900">{memberAddProject.name}</p>
      </div>
      <div className="flex gap-2">
        <input
          value={memberAddQuery}
          onChange={(event) => setMemberAddQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchProjectMembers(); } }}
          placeholder="이름 또는 이메일로 검색"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
        />
        <button
          type="button"
          onClick={() => void searchProjectMembers()}
          disabled={memberAddLoading}
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="사용자 검색"
          title="사용자 검색"
        >
          <Search size={17} />
        </button>
      </div>
      <div className="mt-4 space-y-2">
        {memberAddError ? (
          <p role="alert" className="border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{memberAddError}</p>
        ) : memberAddLoading ? (
          <p className="py-8 text-center text-sm text-slate-400">검색 중...</p>
        ) : memberAddResults.length > 0 ? (
          memberAddResults.map((user) => {
            const alreadyMember = memberAddProject.members.some((member) => member.user.id === user.id);
            return (
              <div key={user.id} className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                <div className="min-w-0 pr-3">
                  <p className="truncate text-sm font-semibold text-slate-900">{displayName(user)}</p>
                  <p className="truncate text-xs text-slate-500">{user.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void addProjectMember(user)}
                  disabled={alreadyMember || memberAddSubmitting}
                  className="shrink-0 rounded-xl border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-600 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                >
                  {alreadyMember ? "이미 추가됨" : memberAddSubmitting ? "추가 중..." : "추가"}
                </button>
              </div>
            );
          })
        ) : memberAddSearched ? (
          <p className="py-8 text-center text-sm text-slate-400">일치하는 사용자가 없습니다.</p>
        ) : (
          <p className="py-8 text-center text-sm text-slate-400">이름이나 이메일로 사용자를 검색하세요.</p>
        )}
      </div>
    </ModalFrame>}
  </div></main>;
}
