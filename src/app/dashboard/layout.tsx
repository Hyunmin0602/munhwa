"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Sidebar from "@/components/Sidebar";
import NewProjectModal from "@/components/NewProjectModal";

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
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
