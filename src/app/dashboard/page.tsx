"use client";
import { useEffect, useState } from "react";
import { FolderKanban, CalendarDays, BookOpen, Users, Pencil } from "lucide-react";
import Link from "next/link";
import dayjs from "dayjs";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/client-fetch";
import ProjectEditModal from "@/components/ProjectEditModal";

interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string;
  members: { user: { name: string | null } }[];
  createdAt: string;
}

type ProjectUpdate = Pick<Project, "id" | "name" | "description" | "color">;

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  useEffect(() => {
    if (window.matchMedia("(max-width: 1023px)").matches) {
      window.location.replace("/dashboard/integrated");
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/api/projects");
        const data = await res.json();
        setProjects(Array.isArray(data) ? data : []);
      } catch {
        // ignore, leave projects empty
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const today = dayjs().format("YYYY년 M월 D일 dddd");

  const handleProjectUpdated = (project: ProjectUpdate) => {
    setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, ...project } : p)));
    setEditingProject(null);
    window.dispatchEvent(new CustomEvent("project-updated", { detail: project }));
  };

  const handleProjectDeleted = (projectId: string) => {
    setProjects((prev) => prev.filter((project) => project.id !== projectId));
    setEditingProject(null);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="px-4 md:px-8 py-4 md:py-6 border-b border-gray-100 bg-white">
        <p className="text-xs text-gray-400 mb-1">{today}</p>
        <h1 className="text-xl font-bold text-gray-900">대시보드</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 md:py-6">
        {loading ? (
          <>
            <Skeleton className="h-4 w-32 mb-5 rounded" />
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <Skeleton className="h-1.5 w-full rounded-none" />
                  <div className="p-5 space-y-3">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1.5 flex-1">
                        <Skeleton className="h-5 w-2/3 rounded-lg" />
                        <Skeleton className="h-3 w-full rounded" />
                        <Skeleton className="h-3 w-4/5 rounded" />
                      </div>
                      <Skeleton className="w-8 h-8 rounded-xl ml-3 flex-shrink-0" />
                    </div>
                    <Skeleton className="h-3 w-1/3 rounded" />
                    <div className="grid grid-cols-3 gap-2">
                      <Skeleton className="h-8 rounded-xl" />
                      <Skeleton className="h-8 rounded-xl" />
                      <Skeleton className="h-8 rounded-xl" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
              <FolderKanban size={28} className="text-indigo-400" />
            </div>
            <p className="text-gray-700 font-medium mb-1">아직 사업이 없습니다</p>
            <p className="text-gray-400 text-sm">왼쪽 사이드바의 <span className="font-medium text-indigo-500">+ 버튼</span>으로 새 사업을 만드세요.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-5">참여 중인 사업 <span className="font-semibold text-gray-800">{projects.length}개</span></p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all overflow-hidden group"
                >
                  {/* Color bar */}
                  <div className="h-1.5 w-full" style={{ backgroundColor: p.color }} />
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h2 className="font-bold text-gray-900 text-base truncate">{p.name}</h2>
                        {p.description && (
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">{p.description}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingProject(p)}
                        className="w-8 h-8 rounded-xl flex items-center justify-center ml-3 flex-shrink-0"
                        style={{ backgroundColor: p.color + "20" }}
                        title="사업 수정"
                      >
                        <Pencil size={14} style={{ color: p.color }} />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-gray-400 mb-4">
                      <Users size={11} />
                      <span>{p.members.length}명</span>
                      <span className="text-gray-200">·</span>
                      <span>{dayjs(p.createdAt).format("YYYY.MM.DD")}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { href: `/dashboard/projects/${p.id}/kanban`, Icon: FolderKanban, label: "칸반" },
                        { href: `/dashboard/projects/${p.id}/schedule`, Icon: CalendarDays, label: "일정" },
                        { href: `/dashboard/projects/${p.id}/archive`, Icon: BookOpen, label: "아카이브" },
                      ].map(({ href, Icon, label }) => (
                        <Link
                          key={href}
                          href={href}
                          className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 text-gray-500 transition-colors group/btn"
                        >
                          <Icon size={13} />
                          {label}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      {editingProject && (
        <ProjectEditModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onUpdated={handleProjectUpdated}
          onDeleted={handleProjectDeleted}
        />
      )}
    </div>
  );
}
