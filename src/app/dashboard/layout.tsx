"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Sidebar from "@/components/Sidebar";
import NewProjectModal from "@/components/NewProjectModal";
import { Skeleton } from "@/components/ui/Skeleton";

interface Project {
  id: string;
  name: string;
  color: string;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/projects")
        .then((r) => r.json())
        .then(setProjects)
        .catch(() => {});
    }
  }, [status]);

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

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar projects={projects} onNewProject={() => setShowModal(true)} />
      <main className="flex-1 overflow-hidden flex flex-col">{children}</main>
      {showModal && (
        <NewProjectModal
          onClose={() => setShowModal(false)}
          onCreated={handleProjectCreated}
        />
      )}
    </div>
  );
}
