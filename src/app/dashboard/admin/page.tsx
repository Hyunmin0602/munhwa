"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, ClipboardList, History, LoaderCircle, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/client-fetch";

type User = { id: string; name: string | null; email: string };
type Project = { id: string; name: string; status: string; space: { id: string; name: string; slug: string; admin: User } | null; owner: User | null; members: Array<{ user: User }>; _count: { members: number } };
type AuditLog = { id: string; action: string; reason: string | null; createdAt: string; actor: User; space: { id: string; name: string } | null };
type SpaceData = { space: { id: string; name: string }; currentAdmin: User; transfers: Array<{ id: string; createdAt: string; actor: User; previousAdmin: User; nextAdmin: User }> };

function userLabel(user: User | null) { return user?.name?.trim() || user?.email || "미지정"; }

export default function SystemAdminPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [spaceData, setSpaceData] = useState<SpaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [successorEmail, setSuccessorEmail] = useState("");
  const [savingSpaceAdmin, setSavingSpaceAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [projectsResponse, logsResponse, spaceResponse] = await Promise.all([
        apiFetch("/api/admin/projects?limit=50", undefined, { showGlobalError: false }),
        apiFetch("/api/admin/audit-logs?limit=20", undefined, { showGlobalError: false }),
        apiFetch("/api/space-administration", undefined, { showGlobalError: false }),
      ]);
      if (projectsResponse.ok) {
        const payload = await projectsResponse.json();
        setProjects(Array.isArray(payload.items) ? payload.items : []);
      }
      if (logsResponse.ok) {
        const payload = await logsResponse.json();
        setLogs(Array.isArray(payload.items) ? payload.items : []);
      }
      if (spaceResponse.ok) setSpaceData(await spaceResponse.json() as SpaceData);
      if (!projectsResponse.ok && !spaceResponse.ok) throw new Error("관리자 정보를 불러올 권한이 없습니다.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "관리자 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const changeOwner = async (project: Project) => {
    const userId = selectedUsers[project.id];
    if (!userId) return;
    setSavingId(project.id);
    setError(null);
    setMessage(null);
    try {
      const response = await apiFetch(`/api/admin/projects/${project.id}/owner`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, reason: reasons[project.id] ?? "" }) }, { showGlobalError: false });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "사업 관리자 변경에 실패했습니다.");
      setMessage(`${project.name}의 사업 관리자를 변경했습니다.`);
      setSelectedUsers((current) => ({ ...current, [project.id]: "" }));
      setReasons((current) => ({ ...current, [project.id]: "" }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "사업 관리자 변경에 실패했습니다.");
    } finally {
      setSavingId(null);
    }
  };

  const transferSpaceAdmin = async (event: React.FormEvent) => {
    event.preventDefault();
    const email = successorEmail.trim();
    if (!email || !spaceData) return;
    if (!window.confirm(`${email} 계정으로 Space 관리자를 이전하시겠습니까?`)) return;
    setSavingSpaceAdmin(true);
    setError(null);
    setMessage(null);
    try {
      const response = await apiFetch("/api/space-administration", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }, { showGlobalError: false });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "Space 관리자 변경에 실패했습니다.");
      setMessage(`${userLabel(payload.currentAdmin)} 계정으로 Space 관리자를 변경했습니다.`);
      setSuccessorEmail("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Space 관리자 변경에 실패했습니다.");
    } finally {
      setSavingSpaceAdmin(false);
    }
  };

  return (
    <main className="h-full overflow-y-auto bg-gray-50 px-4 py-6 pb-24 md:px-8 md:py-8 lg:pb-8">
      <div className="mx-auto max-w-7xl">
        <header className="border-b border-gray-200 pb-6"><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-600">ADMINISTRATION</p><h1 className="text-2xl font-bold text-gray-900">관리자</h1><p className="mt-2 text-sm text-gray-500">시스템 관리자와 Space 관리 권한을 한 곳에서 관리합니다.</p></header>
        {error && <div className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
        {message && <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
        {loading ? <div className="flex items-center justify-center py-24 text-sm text-gray-400"><LoaderCircle size={18} className="mr-2 animate-spin" />관리자 정보를 불러오는 중...</div> : <div className="divide-y divide-gray-200">
          {spaceData && <section className="py-8"><div className="mb-5 flex items-start gap-3"><ShieldCheck size={20} className="mt-0.5 text-indigo-600" /><div><h2 className="text-lg font-bold text-gray-900">{spaceData.space.name} 관리자</h2><p className="mt-1 text-sm text-gray-500">현재 Space 관리자와 인수인계 기록을 관리합니다.</p></div></div><div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"><div className="border-l-2 border-indigo-200 pl-4"><p className="text-xs font-semibold text-gray-400">현재 관리자</p><p className="mt-2 font-semibold text-gray-900">{userLabel(spaceData.currentAdmin)}</p><p className="mt-1 text-sm text-gray-500">{spaceData.currentAdmin.email}</p></div><form onSubmit={transferSpaceAdmin} className="space-y-3 border-l-2 border-gray-200 pl-4"><label className="block text-sm font-medium text-gray-700" htmlFor="successor-email">후임 관리자 이메일</label><div className="flex flex-col gap-2 sm:flex-row"><input id="successor-email" type="email" required value={successorEmail} onChange={(event) => setSuccessorEmail(event.target.value)} placeholder="등록된 계정 이메일" className="min-w-0 flex-1 border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500" /><button type="submit" disabled={savingSpaceAdmin} className="inline-flex items-center justify-center gap-2 bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">{savingSpaceAdmin && <LoaderCircle size={14} className="animate-spin" />}변경</button></div><p className="text-xs text-gray-400">변경 후 기존 관리자 권한은 즉시 회수됩니다.</p></form></div><div className="mt-6 border-t border-gray-100 pt-5"><div className="mb-3 flex items-center gap-2"><History size={16} className="text-gray-500" /><h3 className="text-sm font-semibold text-gray-700">최근 Space 관리자 이관</h3></div>{spaceData.transfers.length === 0 ? <p className="text-sm text-gray-400">기록이 없습니다.</p> : <div className="divide-y divide-gray-100">{spaceData.transfers.map((transfer) => <div key={transfer.id} className="grid gap-1 py-3 text-sm md:grid-cols-[1fr_1fr_1fr_auto]"><span className="text-gray-800">{userLabel(transfer.previousAdmin)} → {userLabel(transfer.nextAdmin)}</span><span className="text-gray-500">실행자: {userLabel(transfer.actor)}</span><span className="text-gray-400">{new Date(transfer.createdAt).toLocaleString("ko-KR")}</span><span className="text-xs text-gray-400">Space 관리자</span></div>)}</div>}</div></section>}
          {projects.length > 0 && <section className="py-8"><div className="mb-5 flex items-start gap-3"><ArrowLeftRight size={20} className="mt-0.5 text-indigo-600" /><div><h2 className="text-lg font-bold text-gray-900">사업별 관리자</h2><p className="mt-1 text-sm text-gray-500">사업 관리자 변경은 참여자 중에서만 지정할 수 있습니다.</p></div></div><div className="divide-y divide-gray-200 border-y border-gray-200">{projects.map((project) => <div key={project.id} className="grid gap-4 py-5 lg:grid-cols-[1fr_1fr_1.5fr] lg:items-center"><div className="min-w-0"><p className="truncate font-semibold text-gray-900">{project.name}</p><p className="mt-1 text-xs text-gray-400">{project.space?.name ?? "Space 미지정"} · 참여자 {project._count.members}명</p></div><div><p className="text-xs text-gray-400">현재 관리자</p><p className="mt-1 text-sm font-medium text-gray-800">{userLabel(project.owner)}</p>{project.owner && <p className="truncate text-xs text-gray-400">{project.owner.email}</p>}</div><div className="flex flex-col gap-2 sm:flex-row"><select value={selectedUsers[project.id] ?? ""} onChange={(event) => setSelectedUsers((current) => ({ ...current, [project.id]: event.target.value }))} className="min-w-0 flex-1 border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"><option value="">새 관리자 선택</option>{project.members.filter(({ user }) => user.id !== project.owner?.id).map(({ user }) => <option key={user.id} value={user.id}>{userLabel(user)} · {user.email}</option>)}</select><input value={reasons[project.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [project.id]: event.target.value }))} placeholder="변경 사유" className="border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 sm:w-40" /><button type="button" disabled={!selectedUsers[project.id] || savingId === project.id} onClick={() => void changeOwner(project)} className="inline-flex items-center justify-center gap-2 bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">{savingId === project.id && <LoaderCircle size={14} className="animate-spin" />}변경</button></div></div>)}</div></section>}
          {logs.length > 0 && <section className="py-8"><div className="mb-5 flex items-center gap-2"><ClipboardList size={18} className="text-gray-500" /><h2 className="text-lg font-bold text-gray-900">최근 관리자 변경 로그</h2></div><div className="divide-y divide-gray-200 border-y border-gray-200">{logs.map((log) => <div key={log.id} className="grid gap-1 py-4 text-sm md:grid-cols-[1.2fr_1fr_1.2fr_1fr]"><span className="font-medium text-gray-800">{log.action}</span><span className="text-gray-600">{log.space?.name ?? "Space 미지정"}</span><span className="text-gray-600">실행자: {userLabel(log.actor)}</span><span className="text-xs text-gray-400">{new Date(log.createdAt).toLocaleString("ko-KR")}{log.reason ? ` · ${log.reason}` : ""}</span></div>)}</div></section>}
        </div>}
      </div>
    </main>
  );
}