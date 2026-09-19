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
        const projectResponse = await apiFetch("/api/projects");
        if (!projectResponse.ok) throw new Error("Project list request failed");
        const projectData = (await projectResponse.json()) as Project[];

        const postData = await Promise.all(
          projectData.map(async (project) => {
            const response = await apiFetch(`/api/projects/${project.id}/archive`);
            if (!response.ok) throw new Error("Archive request failed");
            const items = (await response.json()) as Omit<ArchivePost, "projectId">[];
            return items.map((item) => ({ ...item, projectId: project.id }));
          }),
        );

        if (cancelled) return;
        setProjects(projectData);
        setPosts(postData.flat());
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

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">통합 아카이브</h1>
        <p className="mt-1 text-xs text-gray-400">소속된 모든 사업의 문서와 회의록을 한 곳에서 확인합니다.</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="제목, 작성자, 사업명으로 검색"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {[
            { value: "all" as const, label: "전체" },
            { value: "DOCUMENT" as const, label: "문서" },
            { value: "MEETING" as const, label: "회의록" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setKindFilter(option.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${kindFilter === option.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, index) => <Skeleton key={index} className="h-16 w-full rounded-xl" />)}
          </div>
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
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">
            {filteredPosts.map((post) => {
              const project = projectsById.get(post.projectId);
              return (
                <Link key={post.id} href={`/dashboard/projects/${post.projectId}/archive/${post.id}`} className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-gray-50 md:px-5">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${project?.color ?? "#6366f1"}18`, color: project?.color ?? "#6366f1" }}>
                    {post.kind === "MEETING" ? <BookOpen size={17} /> : <FileText size={17} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{post.title}</p>
                    <p className="mt-1 truncate text-xs text-gray-400">
                      <span className="font-medium text-gray-600">{project?.name ?? "알 수 없는 사업"}</span> · {post.author.name ?? "작성자 없음"} · {dayjs(post.updatedAt).format("YYYY.MM.DD")}
                    </p>
                  </div>
                  <VisibilityBadge visibility={post.visibility} />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
