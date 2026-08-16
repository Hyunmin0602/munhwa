"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import { FolderKanban, Users } from "lucide-react";
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

  useEffect(() => {
    apiFetch("/api/projects")
      .then(async (response) => {
        const data = await response.json();
        setProjects(Array.isArray(data) ? data : []);
      })
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-gray-100 bg-white px-4 py-4 md:px-8 md:py-6">
        <p className="mb-1 text-xs text-gray-400">참여 중인 사업</p>
        <h1 className="text-xl font-bold text-gray-900 md:text-2xl">사업</h1>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6">
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
        ) : projects.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <FolderKanban size={28} className="mb-4 text-gray-300" />
            <p className="font-medium text-gray-600">아직 사업이 없습니다</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
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
        )}
      </main>
    </div>
  );
}
