"use client";
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Menu, Plus } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import BottomTabBar from "@/components/BottomTabBar";
import NewProjectModal from "@/components/NewProjectModal";
import ProjectEditModal from "@/components/ProjectEditModal";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch, subscribeToToasts, showToast } from "@/lib/client-fetch";

interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projectsRequestNonce, setProjectsRequestNonce] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [toasts, setToasts] = useState<Array<{ id: number; type: "error" | "info"; message: string }>>([]);
  const pathname = usePathname();
  const match = pathname?.match(/\/dashboard\/projects\/([^/]+)/);
  const currentProjectId = match?.[1];
  const currentProject = currentProjectId ? projects.find((p) => p.id === currentProjectId) : null;

  useEffect(() => {
    if (status === "unauthenticated") {
      showToast("세션이 만료되어 로그인 화면으로 이동합니다.");
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      (async () => {
        try {
          const res = await apiFetch("/api/projects");
          if (!res.ok) throw new Error("Project list request failed");
          const data = await res.json();
          setProjects(Array.isArray(data) ? data : []);
          setProjectsError(null);
        } catch {
          setProjectsError("사업 목록을 불러오지 못했습니다.");
        }
      })();
    }
  }, [status, projectsRequestNonce]);

  useEffect(() => {
    const unsubscribe = subscribeToToasts(setToasts);
    const handleProjectUpdated = (event: Event) => {
      const project = (event as CustomEvent<Project>).detail;
      setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, ...project } : p)));
    };

    window.addEventListener("project-updated", handleProjectUpdated);
    return () => {
      unsubscribe();
      window.removeEventListener("project-updated", handleProjectUpdated);
    };
  }, []);

  if (status === "loading") {
    return (
      <div className="flex h-screen overflow-hidden bg-gray-50">
        {/* Sidebar skeleton */}
        <div className="w-56 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col p-4 gap-3">
          <Skeleton className="h-8 w-32 mb-2 rounded-xl" />
          <Skeleton className="h-6 w-full rounded-xl" />
          <Skeleton className="h-6 w-full rounded-xl" />
          <Skeleton className="h-6 w-3/4 rounded-xl" />
          <div className="mt-auto">
            <Skeleton className="h-9 w-full rounded-xl" />
          </div>
        </div>
        {/* Main content skeleton */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-100 bg-white">
            <Skeleton className="h-3 w-28 mb-2 rounded" />
            <Skeleton className="h-6 w-24 rounded-lg" />
          </div>
          <div className="flex-1 px-8 py-6">
            <Skeleton className="h-4 w-32 mb-5 rounded" />
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <Skeleton className="h-1.5 w-full rounded-none" />
                  <div className="p-5 space-y-3">
                    <div className="flex justify-between">
                      <div className="space-y-1.5 flex-1">
                        <Skeleton className="h-5 w-3/4 rounded-lg" />
                        <Skeleton className="h-3 w-full rounded" />
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
          </div>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const handleProjectCreated = (project: Project) => {
    setProjects((prev) => [project, ...prev]);
    setShowModal(false);
    router.push(`/dashboard/projects/${project.id}/kanban`);
  };

  const handleProjectUpdated = (project: Project) => {
    setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, ...project } : p)));
    setEditingProject(null);
    window.dispatchEvent(new CustomEvent("project-updated", { detail: project }));
  };

  const handleProjectDeleted = (projectId: string) => {
    setProjects((prev) => prev.filter((project) => project.id !== projectId));
    setEditingProject(null);
    if (currentProjectId === projectId) router.push("/dashboard");
  };

  const handleMoveProject = async (projectId: string, direction: "up" | "down") => {
    const index = projects.findIndex((project) => project.id === projectId);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= projects.length) return;
    const next = [...projects];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setProjects(next);
    const res = await apiFetch("/api/projects/order", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectIds: next.map((project) => project.id) }),
    });
    if (!res.ok) {
      setProjects(projects);
      showToast("사업 순서를 저장하지 못했습니다.");
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar
        projects={projects}
        onNewProject={() => setShowModal(true)}
        onEditProject={setEditingProject}
        onMoveProject={handleMoveProject}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      {projectsError && (
        <div className="fixed left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-lg">
          <span>{projectsError}</span>
          <button type="button" onClick={() => setProjectsRequestNonce((current) => current + 1)} className="font-medium text-rose-700 underline hover:text-rose-900">다시 시도</button>
        </div>
      )}
      <main className="flex-1 overflow-hidden flex flex-col min-w-0 pb-[5.25rem] lg:pb-0">
        {/* 모바일 상단바 */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            aria-label="메뉴 열기"
            title="메뉴"
          >
            <Menu size={20} />
          </button>
          <h1 className="text-base font-bold text-gray-900">
            {currentProject ? currentProject.name : "문화체육위원회"}
          </h1>
          {!currentProject && (
            <button
              onClick={() => setShowModal(true)}
              className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-all"
              title="새 사업 추가"
            >
              <Plus size={20} />
            </button>
          )}
        </div>
        {children}
      </main>
      <BottomTabBar projects={projects} />
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur ${toast.type === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-indigo-200 bg-white text-gray-700"}`}
          >
            {toast.message}
          </div>
        ))}
      </div>
      {showModal && (
        <NewProjectModal
          onClose={() => setShowModal(false)}
          onCreated={handleProjectCreated}
        />
      )}
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
