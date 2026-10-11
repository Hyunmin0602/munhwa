"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import { ChevronRight, FolderKanban, Search, Users, X } from "lucide-react";
import { apiFetch } from "@/lib/client-fetch";
import { Skeleton } from "@/components/ui/Skeleton";

interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string;
  members: { user: { name: string | null } }[];
  createdAt: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const filteredProjects = projects.filter((project) =>
    project.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiFetch("/api/projects");
        if (!response.ok) throw new Error("Projects request failed");
        const data = await response.json();
        if (!cancelled) setProjects(Array.isArray(data?.items) ? data.items : []);
      } catch {
        if (!cancelled) setError("사업 목록을 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-gray-100 bg-white px-4 py-4 md:px-8 md:py-6">
        <p className="mb-1 text-xs text-gray-400">참여 중인 사업</p>
        <div className="flex items-end justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-900 md:text-2xl">사업</h1>
          {!loading && !error && projects.length > 0 && <span className="text-xs text-gray-400">{projects.length}개</span>}
        </div>
      </header>

      <main className="flex-1 overflow-visible px-4 py-4 md:px-8 md:py-6 lg:overflow-y-auto">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
                <Skeleton className="h-1.5 w-full rounded-none" />
                <div className="space-y-3 p-5">
                  <Skeleton className="h-5 w-2/3 rounded-lg" />
                  <Skeleton className="h-3 w-full rounded" />
                  <Skeleton className="h-3 w-1/3 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <p className="font-medium text-rose-700">{error}</p>
            <button type="button" onClick={() => setReloadKey((current) => current + 1)} className="mt-3 font-medium text-rose-700 underline hover:text-rose-900">다시 시도</button>
          </div>
        ) : projects.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <FolderKanban size={28} className="mb-4 text-gray-300" />
            <p className="font-medium text-gray-600">아직 사업이 없습니다</p>
          </div>
        ) : (
          <>
            <label className="relative mb-3 block md:hidden">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="사업명 검색"
                aria-label="사업명 검색"
                className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-10 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
              {query && <button type="button" onClick={() => setQuery("")} aria-label="검색어 지우기" className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"><X size={15} /></button>}
            </label>
            {filteredProjects.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center text-center md:hidden">
                <p className="text-sm font-medium text-gray-600">검색 결과가 없습니다</p>
                <p className="mt-1 text-xs text-gray-400">다른 사업명을 입력하거나 검색어를 지워주세요.</p>
                <button type="button" onClick={() => setQuery("")} className="mt-3 rounded-lg px-3 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50">검색어 지우기</button>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white md:hidden">
                {filteredProjects.map((project) => (
                  <Link key={project.id} href={`/dashboard/projects/${project.id}/kanban`} className="flex min-h-[76px] items-center gap-3 px-3 py-3 transition-colors hover:bg-gray-50 active:bg-indigo-50">
                    <span className="h-10 w-1 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-gray-900">{project.name}</span>
                      {project.description && <span className="mt-0.5 block truncate text-xs text-gray-500">{project.description}</span>}
                      <span className="mt-1 flex items-center gap-1 text-[11px] text-gray-400"><Users size={11} />{project.members.length}명 참여<span className="px-0.5 text-gray-300">·</span>{dayjs(project.createdAt).format("YYYY.MM.DD")}</span>
                    </span>
                    <ChevronRight size={17} className="shrink-0 text-gray-300" />
                  </Link>
                ))}
              </div>
            )}
            <div className="hidden grid-cols-1 gap-4 md:grid md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/dashboard/projects/${project.id}/kanban`}
                className="group overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="h-1.5 w-full" style={{ backgroundColor: project.color }} />
                <div className="p-5">
                  <h2 className="truncate font-bold text-gray-900 group-hover:text-indigo-700">
                    {project.name}
                  </h2>
                  {project.description && (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-400">
                      {project.description}
                    </p>
                  )}
                  <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
                    <Users size={11} />
                    <span>{project.members.length}명</span>
                    <span className="text-gray-200">·</span>
                    <span>{dayjs(project.createdAt).format("YYYY.MM.DD")}</span>
                  </div>
                </div>
              </Link>
            ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
