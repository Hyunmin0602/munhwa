"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import { BookOpen, FileText, Globe, Lock, RotateCw, Search } from "lucide-react";
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
  const [projects, setProjects] = useState<Project[]>([]);
  const [posts, setPosts] = useState<ArchivePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "DOCUMENT" | "MEETING">("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const items: IntegratedArchiveResponse["items"] = [];
        let cursor = "";
        do {
          const query = new URLSearchParams({ type: "archive,meeting", range: "all", limit: "50" });
          if (cursor) query.set("cursor", cursor);
          const response = await apiFetch(`/api/dashboard/integrated?${query.toString()}`);
          if (!response.ok) throw new Error("Archive request failed");
          const payload = await response.json() as IntegratedArchiveResponse;
          if (Array.isArray(payload.items)) items.push(...payload.items);
          cursor = payload.nextCursor ?? "";
          if (!cursor) {
            setProjects(Array.isArray(payload.filters?.projects) ? payload.filters.projects : []);
          }
        } while (cursor);

        if (cancelled) return;
        setPosts(items.map((item) => ({
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
  }, [reloadKey]);

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
    <div className="mx-auto flex h-full max-w-6xl flex-col p-4 md:p-6">
      <header className="mb-4 border-b border-gray-200 pb-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-[11px] font-semibold tracking-wide text-indigo-600">전체 기록</p>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">통합 아카이브</h1>
          </div>
          {loading ? <Skeleton className="h-3 w-14 rounded" /> : <p className="text-xs text-gray-400">전체 {posts.length}개</p>}
        </div>
        <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center">
          <div className="relative min-w-0 flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="제목, 작성자, 사업명으로 검색"
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
          </div>
          <div className="flex gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1">
          {[
              { value: "all" as const, label: "전체", count: posts.length },
              { value: "DOCUMENT" as const, label: "문서", count: documentCount },
              { value: "MEETING" as const, label: "회의록", count: meetingCount },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setKindFilter(option.value)}
                className={`inline-flex min-w-max items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${kindFilter === option.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
            >
                {option.label}<span className={`${kindFilter === option.value ? "text-indigo-600" : "text-gray-400"}`}>{loading ? "-" : option.count}</span>
            </button>
          ))}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
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
              <span>검색 결과 {filteredPosts.length}개</span>
              <span className="hidden sm:inline">최근 수정 순</span>
            </div>
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="hidden grid-cols-[minmax(0,1fr)_10rem_8rem_7rem] gap-4 border-b border-gray-100 bg-gray-50 px-4 py-2 text-[11px] font-semibold text-gray-400 md:grid">
                <span>문서</span><span>사업</span><span>작성자</span><span>공개 범위</span>
              </div>
              {filteredPosts.map((post) => {
                const project = projectsById.get(post.projectId);
                const accent = project?.color ?? "#6366f1";
                return (
                  <Link key={post.id} href={`/dashboard/projects/${post.projectId}/archive/${post.id}`} className="group grid gap-2 border-b border-gray-100 px-4 py-3 transition-colors last:border-b-0 hover:bg-indigo-50/40 md:grid-cols-[minmax(0,1fr)_10rem_8rem_7rem] md:items-center md:gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: `${accent}18`, color: accent }}>
                        {post.kind === "MEETING" ? <BookOpen size={15} /> : <FileText size={15} />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900 group-hover:text-indigo-700">{post.title}</p>
                        <p className="mt-0.5 text-[11px] text-gray-400">{post.kind === "MEETING" ? "회의록" : "문서"} · {dayjs(post.updatedAt).format("YYYY.MM.DD HH:mm")}</p>
                      </div>
                    </div>
                    <p className="truncate pl-11 text-xs font-medium text-gray-600 md:pl-0">{project?.name ?? "알 수 없는 사업"}</p>
                    <p className="truncate pl-11 text-xs text-gray-500 md:pl-0">{post.author.name ?? "작성자 없음"}</p>
                    <div className="pl-11 md:pl-0"><VisibilityBadge visibility={post.visibility} /></div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
