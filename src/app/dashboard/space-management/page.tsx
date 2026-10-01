"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-fetch";

type Tab = "department" | "members" | "projects" | "logs";
type Cohort = { id: string; name: string; isActive: boolean; order: number; _count: { users: number } };
type User = { id: string; name: string | null; email: string; role?: string };
type Member = { id: string; role: string; joinedAt: string; user: User & { cohort: { id: string; name: string } | null; projects: Array<{ role: string; project: { id: string; name: string } }> } };
type ProjectMember = { id: string; role: string; user: User };
type Project = { id: string; name: string; description: string | null; status: string; updatedAt: string; owner: User | null; members: ProjectMember[]; _count: { members: number; archivePosts: number; events: number; columns: number } };
type Activity = { id: string; type: string; action: string; title: string; timestamp: string; beforeData?: string | null; afterData?: string | null; project: { id: string; name: string }; actor: User };

const tabs: Array<[Tab, string]> = [["department", "부서 관리"], ["members", "구성원 관리"], ["projects", "사업 관리"], ["logs", "로그 관리"]];

function displayName(user: User | null) { return user?.name?.trim() || user?.email || "미지정"; }
async function errorMessage(response: Response, fallback: string) { const payload = await response.json().catch(() => null); return payload?.error?.message ?? payload?.error ?? fallback; }

export default function SpaceManagementPage() {
  const [tab, setTab] = useState<Tab>("department");
  const [spaceName, setSpaceName] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [logs, setLogs] = useState<Activity[]>([]);
  const [logNextCursor, setLogNextCursor] = useState<string | null>(null);
  const [loadingMoreLogs, setLoadingMoreLogs] = useState(false);
  const [logType, setLogType] = useState("");
  const [logQuery, setLogQuery] = useState("");
  const [query, setQuery] = useState("");
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

  const loadMembers = useCallback(async () => {
    const url = query.trim() ? `/api/space-management/members?query=${encodeURIComponent(query.trim())}` : "/api/space-management/members";
    const response = await apiFetch(url, undefined, { showGlobalError: false });
    if (!response.ok) throw new Error(await errorMessage(response, "구성원 목록을 불러오지 못했습니다."));
    const payload = await response.json();
    setMembers(Array.isArray(payload.items) ? payload.items : []);
  }, [query]);

  const loadProjects = useCallback(async () => {
    const response = await apiFetch("/api/space-management/projects", undefined, { showGlobalError: false });
    if (!response.ok) throw new Error(await errorMessage(response, "사업 목록을 불러오지 못했습니다."));
    const payload = await response.json();
    setProjects(Array.isArray(payload.items) ? payload.items : []);
  }, []);

  const loadLogs = useCallback(async () => {
    const params = new URLSearchParams({ limit: "100" });
    if (logType) params.set("type", logType);
    if (logQuery.trim()) params.set("query", logQuery.trim());
    const response = await apiFetch(`/api/space-management/logs?${params.toString()}`, undefined, { showGlobalError: false });
    if (!response.ok) throw new Error(await errorMessage(response, "활동 로그를 불러오지 못했습니다."));
    const payload = await response.json();
    setLogs(Array.isArray(payload.items) ? payload.items : []);
    setLogNextCursor(payload.nextCursor ?? null);
  }, [logQuery, logType]);

  const loadMoreLogs = async () => {
    if (!logNextCursor || loadingMoreLogs) return;
    setLoadingMoreLogs(true);
    try {
      const params = new URLSearchParams({ limit: "100", cursor: logNextCursor });
      if (logType) params.set("type", logType);
      if (logQuery.trim()) params.set("query", logQuery.trim());
      const response = await apiFetch(`/api/space-management/logs?${params.toString()}`, undefined, { showGlobalError: false });
      if (!response.ok) throw new Error(await errorMessage(response, "활동 로그를 더 불러오지 못했습니다."));
      const payload = await response.json();
      setLogs((current) => [...current, ...(Array.isArray(payload.items) ? payload.items : [])]);
      setLogNextCursor(payload.nextCursor ?? null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "활동 로그를 더 불러오지 못했습니다."); }
    finally { setLoadingMoreLogs(false); }
  };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      if (tab === "department") await loadSettings();
      if (tab === "members") await loadMembers();
      if (tab === "projects") await loadProjects();
      if (tab === "logs") await loadLogs();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "관리자 설정을 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, [loadLogs, loadMembers, loadProjects, loadSettings, tab]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

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

  const addProjectMember = (project: Project) => run(`add-member-${project.id}`, async () => {
    const email = window.prompt(`${project.name}에 추가할 계정 이메일`); if (!email?.trim()) return;
    const response = await apiFetch(`/api/projects/${project.id}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim() }) }, { showGlobalError: false });
    if (!response.ok) throw new Error(await errorMessage(response, "사업 구성원을 추가하지 못했습니다."));
    await loadProjects(); setNotice("사업 구성원을 추가했습니다.");
  });

  const removeProjectMember = (project: Project, member: ProjectMember) => run(`remove-member-${member.id}`, async () => {
    if (!window.confirm(`${displayName(member.user)}님을 사업에서 제거하시겠습니까?`)) return;
    const response = await apiFetch(`/api/projects/${project.id}/members/${member.id}`, { method: "DELETE" }, { showGlobalError: false });
    if (!response.ok) throw new Error(await errorMessage(response, "사업 구성원을 제거하지 못했습니다."));
    await loadProjects(); setNotice("사업 구성원을 제거했습니다.");
  });

  return <main className="h-full overflow-y-auto bg-slate-50 px-3 py-4 pb-24 md:px-6 md:py-6 lg:pb-6"><div className="mx-auto max-w-7xl">
    <header className="border-b border-slate-200 pb-4"><p className="text-xs font-semibold text-indigo-600">관리자 설정</p><h1 className="mt-1 text-xl font-bold tracking-tight text-slate-950 md:text-2xl">관리자 설정</h1><p className="mt-1 text-sm text-slate-500">{spaceName || "부서"} 운영에 필요한 설정을 관리합니다.</p></header>
    <div className="mt-4 grid gap-5 lg:grid-cols-[11rem_minmax(0,1fr)]">
      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 pb-1 lg:block lg:border-b-0 lg:border-r lg:pb-0 lg:pr-3" aria-label="관리자 설정 하위 메뉴">{tabs.map(([value, text]) => <button key={value} type="button" onClick={() => setTab(value)} className={`block whitespace-nowrap border-b-2 px-3 py-2.5 text-left text-sm font-semibold lg:w-full lg:border-b-0 lg:border-l-2 ${tab === value ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}>{text}</button>)}</nav>
      <section className="min-w-0">{error && <div className="mb-4 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}{notice && <div className="mb-4 border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>}
        {loading ? <div className="border border-slate-200 bg-white px-4 py-16 text-center text-sm text-slate-400">불러오는 중...</div> : <>
          {tab === "department" && <div className="space-y-4"><section className="border border-slate-200 bg-white"><div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-bold text-slate-900">부서 기본 설정</h2><p className="mt-1 text-xs text-slate-500">좌측 상단 부서명과 회원가입 기수에 반영됩니다.</p></div><div className="flex flex-col gap-2 px-4 py-3 sm:flex-row"><input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} className="min-w-0 flex-1 border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500" /><button type="button" onClick={() => void saveSpaceName()} disabled={working === "space-name"} className="border border-indigo-600 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">저장</button></div></section><section className="border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div><h2 className="text-sm font-bold text-slate-900">기수 설정</h2><p className="mt-1 text-xs text-slate-500">회원가입 화면에는 활성 기수만 표시됩니다.</p></div><button type="button" onClick={() => void addCohort()} className="border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">기수 추가</button></div><div className="divide-y divide-slate-100">{cohorts.map((cohort) => <div key={cohort.id} className="grid gap-2 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_6rem_5rem] sm:items-center"><span className="text-sm text-slate-800">{cohort.name}</span><span className="text-xs text-slate-400">가입자 {cohort._count.users}명</span><button type="button" onClick={() => void toggleCohort(cohort)} disabled={working === `cohort-${cohort.id}`} className={`px-2 py-1 text-xs font-semibold ${cohort.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{cohort.isActive ? "활성" : "비활성"}</button></div>)}{cohorts.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-400">등록된 기수가 없습니다.</p>}</div></section></div>}
          {tab === "members" && <section className="border border-slate-200 bg-white"><div className="flex items-center gap-3 border-b border-slate-200 px-3 py-2"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름 또는 이메일 검색" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /><span className="text-xs tabular-nums text-slate-400">{members.length}명</span></div><div className="overflow-x-auto"><div className="grid min-w-[48rem] grid-cols-[minmax(15rem,1fr)_8rem_10rem_12rem] bg-slate-50 px-4 py-2 text-[11px] font-semibold text-slate-400"><span>기본 정보</span><span>기수</span><span>역할</span><span>참여 사업</span></div>{members.map((member) => <div key={member.id} className="grid min-w-[48rem] grid-cols-[minmax(15rem,1fr)_8rem_10rem_12rem] items-center border-t border-slate-100 px-4 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{displayName(member.user)}</p><p className="truncate text-xs text-slate-500">{member.user.email}</p></div><span className="truncate text-xs text-slate-500">{member.user.cohort?.name ?? "미지정"}</span><select value={member.role === "space_manager" ? "space_manager" : "member"} onChange={(event) => void updateRole(member, event.target.value as "member" | "space_manager")} disabled={working === `member-${member.user.id}`} className="mr-3 rounded border border-slate-200 px-2 py-1.5 text-xs"><option value="member">멤버</option><option value="space_manager">관리자</option></select><span className="truncate text-xs text-slate-600">{member.user.projects.length ? member.user.projects.map((item) => item.project.name).join(", ") : "참여 사업 없음"}</span></div>)}</div></section>}
          {tab === "projects" && <section className="space-y-3">{projects.map((project) => <article key={project.id} className="border border-slate-200 bg-white"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3"><div className="min-w-0"><h2 className="truncate text-sm font-bold text-slate-900">{project.name}</h2><p className="mt-1 text-xs text-slate-500">관리자 {displayName(project.owner)} · 구성원 {project._count.members}명 · 문서 {project._count.archivePosts}개 · 일정 {project._count.events}개</p></div><div className="flex gap-1"><button type="button" onClick={() => void renameProject(project)} className="border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600">변경</button><button type="button" onClick={() => void deleteProject(project)} disabled={working === `delete-${project.id}`} className="border border-rose-200 px-2.5 py-1.5 text-xs text-rose-600">삭제</button></div></div><div className="flex flex-wrap items-center gap-2 px-4 py-2.5"><span className="text-xs font-semibold text-slate-500">사업 구성원</span>{project.members.map((member) => <span key={member.id} className="inline-flex items-center gap-1 border border-slate-200 px-2 py-1 text-xs text-slate-600">{displayName(member.user)}<button type="button" onClick={() => void removeProjectMember(project, member)} className="text-rose-500" aria-label={`${displayName(member.user)} 제거`}>×</button></span>)}<button type="button" onClick={() => void addProjectMember(project)} className="border border-dashed border-indigo-300 px-2 py-1 text-xs font-semibold text-indigo-600">+ 인원 추가</button></div></article>)}{projects.length === 0 && <div className="border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-400">등록된 사업이 없습니다.</div>}</section>}
          {tab === "logs" && <section className="border border-slate-200 bg-white"><div className="flex flex-wrap gap-2 border-b border-slate-200 p-3"><input value={logQuery} onChange={(event) => setLogQuery(event.target.value)} placeholder="항목, 사업, 실행자 검색" className="min-w-48 flex-1 border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-indigo-500" /><select value={logType} onChange={(event) => setLogType(event.target.value)} className="border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-indigo-500"><option value="">전체 유형</option><option value="일정">일정</option><option value="칸반">칸반</option><option value="문서">문서</option></select><span className="self-center text-xs tabular-nums text-slate-400">{logs.length}건</span></div><div className="grid grid-cols-[5rem_4rem_minmax(0,1fr)_8rem_9rem] bg-slate-50 px-4 py-2 text-[11px] font-semibold text-slate-400"><span>유형</span><span>동작</span><span>항목</span><span>사업</span><span>실행자</span></div><div className="divide-y divide-slate-100">{logs.map((log) => <div key={log.id} className="grid grid-cols-[5rem_4rem_minmax(0,1fr)_8rem_9rem] items-center px-4 py-2.5 text-xs"><span className="font-semibold text-slate-600">{log.type}</span><span className="text-slate-500">{log.action}</span><span className="truncate text-slate-800">{log.title}</span><span className="truncate text-slate-500">{log.project.name}</span><span className="truncate text-slate-500">{displayName(log.actor)}</span></div>)}{logs.length === 0 && <p className="px-4 py-12 text-center text-sm text-slate-400">조건에 맞는 활동 로그가 없습니다.</p>}</div>{logNextCursor && <div className="border-t border-slate-100 p-3 text-center"><button type="button" onClick={() => void loadMoreLogs()} disabled={loadingMoreLogs} className="border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">{loadingMoreLogs ? "불러오는 중..." : "더 보기"}</button></div>}</section>}
        </>}
      </section>
    </div>
  </div></main>;
}
