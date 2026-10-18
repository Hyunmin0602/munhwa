"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import { BookOpen, FileText, Globe, Lock, Plus, RotateCw, Search, Trash2 } from "lucide-react";
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
  project: Project;
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
};

type ArchiveType = "archive" | "meeting";
type Cursors = Partial<Record<ArchiveType, string | null>>;

async function fetchPosts(types: ArchiveType[], query: string, cursors: Cursors, signal: AbortSignal) {
  const pages = await Promise.all(types.map(async (type) => {
    const params = new URLSearchParams({ type, range: "all", query });
    if (cursors[type]) params.set("cursor", cursors[type]);
    const response = await apiFetch(`/api/dashboard/integrated?${params}`, { signal });
    if (!response.ok) throw new Error("Archive request failed");
    return { type, payload: await response.json() as IntegratedArchiveResponse };
  }));
  const nextCursors: Cursors = {};
  const posts: ArchivePost[] = [];
  for (const { type, payload } of pages) {
    nextCursors[type] = payload.nextCursor;
    posts.push(...payload.items.map((item) => ({
      id: item.id, title: item.title, kind: item.type === "meeting" ? "MEETING" as const : "DOCUMENT" as const,
      visibility: item.visibility, updatedAt: item.timestamp, author: { name: item.authorName },
      projectId: item.project.id, project: item.project,
    })));
  }
  return { posts, cursors: nextCursors };
}

function ArchiveListSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="hidden grid-cols-[minmax(0,1fr)_10rem_8rem_7rem] gap-4 border-b border-gray-100 bg-gray-50 px-4 py-2 md:grid">
        {["w-12", "w-10", "w-12", "w-14"].map((width, index) => <Skeleton key={`${width}-${index}`} className={`h-3 ${width} rounded`} />)}
      </div>
      {[...Array(6)].map((_, index) => (
        <div key={index} className="grid gap-2 border-b border-gray-100 px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_10rem_8rem_7rem] md:items-center md:gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 flex-shrink-0 rounded-md" />
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
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "DOCUMENT" | "MEETING">("all");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);

  const [cursors, setCursors] = useState<Cursors>({});
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [projectQuery, setProjectQuery] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [projectCursor, setProjectCursor] = useState<string | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const pageController = useRef<AbortController | null>(null);
  const projectController = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const timer = setTimeout(() => setProjectSearch(projectQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [projectQuery]);

  useEffect(() => {
    const controller = new AbortController();
    pageController.current = controller;
    const types: ArchiveType[] = kindFilter === "all" ? ["archive", "meeting"]
      : [kindFilter === "MEETING" ? "meeting" : "archive"];
    void (async () => {
      setLoading(true);
      setLoadingMore(false);
      setLoadMoreError(null);
      setError(null);
      setCursors({});
      try {
        const page = await fetchPosts(types, searchQuery, {}, controller.signal);
        if (controller.signal.aborted) return;
        setPosts(page.posts);
        setCursors(page.cursors);
      } catch {
        if (!controller.signal.aborted) setError("통합 아카이브를 불러오지 못했습니다.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [reloadKey, kindFilter, searchQuery]);

  useEffect(() => {
    const controller = new AbortController();
    projectController.current = controller;
    void (async () => {
      setLoadingProjects(true);
      setProjectCursor(null);
      try {
        const params = new URLSearchParams({ view: "filters", query: projectSearch });
        const response = await apiFetch(`/api/dashboard/integrated?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error();
        const payload = await response.json() as { items: Project[]; nextCursor: string | null };
        if (controller.signal.aborted) return;
        setProjects(payload.items);
        setProjectCursor(payload.nextCursor);
        setSelectedProjectId((current) => payload.items.some((project) => project.id === current) ? current : payload.items[0]?.id ?? "");
      } catch {
        if (!controller.signal.aborted) setActionError("사업 목록을 불러오지 못했습니다.");
      } finally {
        if (!controller.signal.aborted) setLoadingProjects(false);
      }
    })();
    return () => controller.abort();
  }, [projectSearch, reloadKey]);

  const loadMore = async () => {
    const controller = pageController.current;
    if (!controller || controller.signal.aborted || loadingMore) return;
    const types = (["archive", "meeting"] as const).filter((type) => cursors[type]);
    if (!types.length) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const page = await fetchPosts(types, searchQuery, cursors, controller.signal);
      if (controller.signal.aborted) return;
      setPosts((current) => [...new Map([...current, ...page.posts].map((post) => [post.id, post])).values()]);
      setCursors((current) => ({ ...current, ...page.cursors }));
    } catch {
      if (!controller.signal.aborted) setLoadMoreError("다음 문서를 불러오지 못했습니다. 다시 시도해주세요.");
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  };

  const loadMoreProjects = async () => {
    const controller = projectController.current;
    if (!controller || controller.signal.aborted || !projectCursor || loadingProjects) return;
    setLoadingProjects(true);
    try {
      const params = new URLSearchParams({ view: "filters", query: projectSearch, cursor: projectCursor });
      const response = await apiFetch(`/api/dashboard/integrated?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error();
      const payload = await response.json() as { items: Project[]; nextCursor: string | null };
      if (controller.signal.aborted) return;
      setProjects((current) => [...new Map([...current, ...payload.items].map((project) => [project.id, project])).values()]);
      setProjectCursor(payload.nextCursor);
    } catch {
      if (!controller.signal.aborted) setActionError("다음 사업을 불러오지 못했습니다.");
    } finally {
      if (!controller.signal.aborted) setLoadingProjects(false);
    }
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
      if (!response.ok) throw new Error(payload?.error?.message ?? (typeof payload?.error === "string" ? payload.error : "문서를 만들지 못했습니다."));
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
        throw new Error(payload?.error?.message ?? (typeof payload?.error === "string" ? payload.error : "문서를 삭제하지 못했습니다."));
      }
      setPosts((current) => current.filter((item) => item.id !== post.id));
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "문서를 삭제하지 못했습니다.");
    } finally {
      setDeletingPostId(null);
    }
  };

  const filteredPosts = useMemo(() => [...posts].sort((a, b) =>
    dayjs(b.updatedAt).valueOf() - dayjs(a.updatedAt).valueOf() || b.id.localeCompare(a.id)), [posts]);
  const hasMore = Object.values(cursors).some(Boolean);

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
            <input value={projectQuery} onChange={(event) => setProjectQuery(event.target.value)} maxLength={256} aria-label="문서를 만들 사업 검색" placeholder="사업 검색" className="w-24 min-w-0 rounded-lg border border-gray-200 px-2 py-2 text-xs sm:w-28" />
            <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)} disabled={projects.length === 0 || creating || loadingProjects} aria-label="문서를 만들 사업 선택" className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs text-gray-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 sm:w-40 sm:flex-none">
              {projects.length === 0 ? <option value="">사업 없음</option> : projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            {projectCursor && <button type="button" onClick={() => void loadMoreProjects()} disabled={loadingProjects} className="shrink-0 text-xs text-indigo-600 disabled:opacity-50">사업 더 보기</button>}
            <button type="button" onClick={() => void createPost()} disabled={creating || loadingProjects || projects.length === 0} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"><Plus size={14} />{creating ? "생성 중" : "새 문서"}</button>
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
              maxLength={256}
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
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50"><FileText size={28} className="text-indigo-400" /></div>
            <p className="font-medium text-gray-700">표시할 문서가 없습니다</p>
            <p className="mt-1 text-sm text-gray-400">검색어나 유형을 바꿔 다시 확인하세요.</p>
          </div>
        ) : (
          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-gray-400">
              <span>불러온 검색 결과 {filteredPosts.length}개{hasMore ? " · 다음 페이지 있음" : ""}</span>
              <span className="hidden sm:inline">최근 수정 순</span>
            </div>
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="hidden grid-cols-[minmax(0,1fr)_14rem_8rem_7rem_2.5rem] gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2 text-[11px] font-semibold text-gray-400 md:grid">
                <span>문서</span><span>사업</span><span>작성자</span><span>공개 범위</span><span aria-hidden="true" />
              </div>
              {filteredPosts.map((post) => {
                const project = post.project;
                const accent = project?.color ?? "#6366f1";
                return (
                  <div key={post.id} className="group relative border-b border-gray-100 last:border-b-0">
                    <Link href={`/dashboard/projects/${post.projectId}/archive/${post.id}`} className="grid grid-cols-2 gap-1.5 px-3 py-2.5 pr-14 transition-colors hover:bg-indigo-50/40 md:grid-cols-[minmax(0,1fr)_14rem_8rem_7rem_2.5rem] md:items-center md:gap-3 md:px-4 md:py-2.5 md:pr-4">
                    <div className="col-span-2 flex min-w-0 items-center gap-3 md:col-span-1">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: `${accent}18`, color: accent }}>
                        {post.kind === "MEETING" ? <BookOpen size={15} /> : <FileText size={15} />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900 group-hover:text-indigo-700">{post.title}</p>
                        <p className="mt-0.5 text-[11px] text-gray-400">{post.kind === "MEETING" ? "회의록" : "문서"} · {dayjs(post.updatedAt).format("YYYY.MM.DD HH:mm")}</p>
                      </div>
                    </div>
                    <div className="col-span-2 flex min-w-0 items-center gap-2 pl-11 pr-12 md:contents">
                      <p className="min-w-0 max-w-[50%] truncate text-xs font-medium text-gray-600 md:max-w-none">{project?.name ?? "알 수 없는 사업"}</p>
                      <p className="min-w-0 max-w-[28%] truncate text-xs text-gray-500 md:max-w-none">{post.author.name ?? "작성자 없음"}</p>
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
            </div>
          </div>
        )}
        {!loading && !error && hasMore && <div className="mt-4 flex flex-col items-center gap-2">
          <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 disabled:opacity-50">{loadingMore ? "불러오는 중..." : "더 불러오기"}</button>
          {loadMoreError && <p className="text-xs text-rose-600">{loadMoreError}</p>}
        </div>}
      </div>
    </div>
  );
}
