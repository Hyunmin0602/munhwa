"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import { Globe, Lock, Plus, RotateCw, Search, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/client-fetch";
import { Skeleton } from "@/components/ui/Skeleton";

type Project = { id: string; name: string; color: string };
type Visibility = "PRIVATE" | "INTERNAL" | "EXTERNAL";
type ArchivePost = {
  id: string;
  title: string;
  kind: "DOCUMENT" | "MEETING";
  visibility: Visibility;
  updatedAt: string;
  author: { name: string | null };
  projectId: string;
};

type IntegratedArchiveResponse = {
  items: Array<{
    id: string;
    type: "archive" | "meeting";
    title: string;
    timestamp: string;
    visibility: Visibility;
    authorName: string | null;
    project: Project;
  }>;
  nextCursor: string | null;
  filters?: { projects?: Project[] };
};

function ArchiveListSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="hidden grid-cols-[minmax(0,1fr)_8rem_7rem_7rem] gap-4 border-b border-gray-100 bg-gray-50 px-4 py-2 md:grid">
        {["w-12", "w-10", "w-12", "w-14"].map((width, index) => (
          <Skeleton key={`${width}-${index}`} className={`h-3 ${width} rounded`} />
        ))}
      </div>
      {[...Array(6)].map((_, index) => (
        <div key={index} className="grid gap-2 border-b border-gray-100 px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_8rem_7rem_7rem] md:items-center md:gap-4">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/3 rounded" />
              <Skeleton className="h-3 w-1/3 rounded" />
            </div>
          </div>
          <Skeleton className="ml-11 h-3 w-2/3 rounded md:ml-0" />
          <Skeleton className="ml-11 h-3 w-1/2 rounded md:ml-0" />
          <Skeleton className="ml-11 h-5 w-14 rounded-full md:ml-0" />
        </div>
      ))}
    </div>
  );
}

function VisibilityBadge({ visibility }: { visibility: Visibility }) {
  if (visibility === "EXTERNAL") {
    return <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"><Globe size={10} />외부</span>;
  }
  if (visibility === "INTERNAL") {
    return <span className="flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700"><Globe size={10} />내부</span>;
  }
  return <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500"><Lock size={10} />비공개</span>;
}

export default function IntegratedArchive() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [posts, setPosts] = useState<ArchivePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [currentCursor, setCurrentCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "DOCUMENT" | "MEETING">("all");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ type: "archive,meeting", range: "all", limit: "10" });
        if (currentCursor) params.set("cursor", currentCursor);
        const response = await apiFetch(`/api/dashboard/integrated?${params.toString()}`);
        if (!response.ok) throw new Error("Archive request failed");
        const payload = await response.json() as IntegratedArchiveResponse;

        if (cancelled) return;
        setProjects(Array.isArray(payload.filters?.projects) ? payload.filters.projects : []);
        setSelectedProjectId((current) => current || payload.filters?.projects?.[0]?.id || "");
        setNextCursor(typeof payload.nextCursor === "string" ? payload.nextCursor : null);
        setPosts((Array.isArray(payload.items) ? payload.items : []).map((item) => ({
          id: item.id,
          title: item.title,
          kind: item.type === "meeting" ? "MEETING" : "DOCUMENT",
          visibility: item.visibility,
          updatedAt: item.timestamp,
          author: { name: item.authorName },
          projectId: item.project.id,
        })));
      } catch {
        if (!cancelled) setError("통합 아카이브를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reloadKey, currentCursor]);

  const goNextPage = () => {
    if (!nextCursor || loading) return;
    setCursorHistory((current) => [...current, currentCursor ?? ""]);
    setCurrentCursor(nextCursor);
  };

  const goPreviousPage = () => {
    if (!cursorHistory.length || loading) return;
    setCursorHistory((current) => {
      const nextHistory = [...current];
      const previousCursor = nextHistory.pop() ?? "";
      setCurrentCursor(previousCursor || null);
      return nextHistory;
    });
  };

  const createPost = async () => {
    if (!selectedProjectId) {
      setActionError("문서를 만들 사업을 먼저 선택해주세요.");
      return;
    }
    setCreating(true);
    setActionError(null);
    try {
      const response = await apiFetch(`/api/projects/${selectedProjectId}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "제목 없음" }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = typeof payload?.error === "string"
          ? payload.error
          : (typeof payload?.error?.message === "string" ? payload.error.message : "문서를 만들지 못했습니다.");
        throw new Error(message);
      }
      router.push(`/dashboard/projects/${selectedProjectId}/archive/${payload.id}`);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "문서를 만들지 못했습니다.");
    } finally {
      setCreating(false);
    }
  };

  const deletePost = async (post: ArchivePost) => {
    if (!confirm(`'${post.title}' 문서를 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.`)) return;
    setDeletingPostId(post.id);
    setActionError(null);
    try {
      const response = await apiFetch(`/api/projects/${post.projectId}/archive/${post.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = typeof payload?.error === "string"
          ? payload.error
          : (typeof payload?.error?.message === "string" ? payload.error.message : "문서를 삭제하지 못했습니다.");
        throw new Error(message);
      }
      setPosts((current) => current.filter((item) => item.id !== post.id));
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "문서를 삭제하지 못했습니다.");
    } finally {
      setDeletingPostId(null);
    }
  };

  const projectsById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);

  const filteredPosts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return posts
      .filter((post) => kindFilter === "all" || post.kind === kindFilter)
      .filter((post) => {
        if (!normalizedQuery) return true;
        const project = projectsById.get(post.projectId);
        const haystack = `${post.title} ${post.author.name ?? ""} ${project?.name ?? ""}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .sort((a, b) => dayjs(b.updatedAt).valueOf() - dayjs(a.updatedAt).valueOf());
  }, [posts, kindFilter, query, projectsById]);

  const documentCount = posts.filter((post) => post.kind === "DOCUMENT").length;
  const meetingCount = posts.filter((post) => post.kind === "MEETING").length;

  return (
    <div className="mx-auto flex h-auto min-h-full w-full flex-col p-4 md:h-full md:p-6">
      <header className="mb-4 border-b border-gray-200 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">통합 아카이브</h1>
          </div>
          <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
            <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)} disabled={projects.length === 0 || creating} aria-label="문서를 만들 사업 선택" className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs text-gray-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 sm:w-40 sm:flex-none">
              {projects.length === 0 ? <option value="">사업 없음</option> : projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <button type="button" onClick={() => void createPost()} disabled={creating || projects.length === 0} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"><Plus size={14} />{creating ? "생성 중" : "새 문서"}</button>
          </div>
        </div>
        {actionError && <p className="mt-3 text-sm font-medium text-rose-600">{actionError}</p>}
        <div className="mt-4 flex w-full items-center gap-1.5">
          <div className="flex min-w-0 max-w-[55%] shrink-0 gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1 sm:max-w-none">
          {[
              { value: "all" as const, label: "전체", count: posts.length },
              { value: "DOCUMENT" as const, label: "문서", count: documentCount },
              { value: "MEETING" as const, label: "회의록", count: meetingCount },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setKindFilter(option.value)}
                className={`inline-flex min-w-max items-center gap-1 rounded-md px-1.5 py-1.5 text-[10px] font-medium transition-colors sm:px-2 sm:text-[11px] ${kindFilter === option.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
            >
                {option.label}<span className={`${kindFilter === option.value ? "text-indigo-600" : "text-gray-400"}`}>{loading ? "-" : option.count}</span>
            </button>
          ))}
          </div>
          <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
            <Search size={15} className="pointer-events-none absolute right-0 top-1/2 mr-3 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="제목, 작성자, 사업명으로 검색"
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-9 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-visible lg:overflow-y-auto">
        {loading ? (
          <ArchiveListSkeleton />
        ) : error ? (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <p className="font-medium text-rose-700">{error}</p>
            <button type="button" onClick={() => setReloadKey((current) => current + 1)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
              <RotateCw size={14} />다시 시도
            </button>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50" />
            <p className="font-medium text-gray-700">표시할 문서가 없습니다</p>
            <p className="mt-1 text-sm text-gray-400">검색어나 유형을 바꿔 다시 확인하세요.</p>
          </div>
        ) : (
          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-gray-400">
              <span>검색 결과 {filteredPosts.length}개</span>
              <span className="hidden sm:inline">최근 수정 순</span>
            </div>
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="hidden grid-cols-[minmax(0,1fr)_12rem_6.5rem_7rem_2.5rem] gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2 text-[11px] font-semibold text-gray-400 md:grid">
                <span>문서</span><span>사업</span><span>작성자</span><span>공개 범위</span><span aria-hidden="true" />
              </div>
              {filteredPosts.map((post) => {
                const project = projectsById.get(post.projectId);
                return (
                  <div key={post.id} className="group relative border-b border-gray-100 last:border-b-0">
                    <Link href={`/dashboard/projects/${post.projectId}/archive/${post.id}`} className="grid grid-cols-2 gap-1.5 px-3 py-2.5 pr-14 transition-colors hover:bg-indigo-50/40 md:grid-cols-[minmax(0,1fr)_12rem_6.5rem_7rem_2.5rem] md:items-center md:gap-3 md:px-4 md:py-2.5 md:pr-4">
                    <div className="col-span-2 flex min-w-0 items-start gap-2 md:col-span-1 md:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900 group-hover:text-indigo-700">{post.title}</p>
                        <p className="mt-0.5 text-[11px] text-gray-400">{post.kind === "MEETING" ? "회의록" : "문서"} · {dayjs(post.updatedAt).format("YYYY.MM.DD HH:mm")}</p>
                      </div>
                    </div>
                    <div className="col-span-2 flex min-w-0 items-center gap-2 pl-0 pr-12 md:contents">
                      <p className="min-w-0 truncate text-xs font-medium text-gray-600 md:max-w-none">{project?.name ?? "알 수 없는 사업"}</p>
                      <p className="min-w-0 truncate text-xs text-gray-500 md:max-w-none">{post.author.name ?? "작성자 없음"}</p>
                      <div className="ml-auto shrink-0"><VisibilityBadge visibility={post.visibility} /></div>
                    </div>
                    <span aria-hidden="true" className="hidden md:block" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => void deletePost(post)}
                      disabled={deletingPostId === post.id}
                      aria-label={`${post.title} 삭제`}
                      title="문서 삭제"
                      className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-gray-300 transition-colors hover:bg-rose-50 hover:text-rose-500 disabled:cursor-wait disabled:opacity-50 md:right-1 md:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
              <div className="flex items-center justify-center gap-2 border-t border-gray-100 px-4 py-3">
                <button
                  type="button"
                  onClick={goPreviousPage}
                  disabled={!cursorHistory.length || loading}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  이전
                </button>
                <p className="min-w-14 text-center text-xs text-gray-400">{cursorHistory.length + 1}페이지</p>
                <button
                  type="button"
                  onClick={goNextPage}
                  disabled={!nextCursor || loading}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  다음
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
