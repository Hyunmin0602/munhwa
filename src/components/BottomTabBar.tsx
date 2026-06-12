"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LayoutGrid, FolderKanban, CalendarDays, BookOpen, ChevronUp } from "lucide-react";

interface Project { id: string; name: string; color: string; }

export default function BottomTabBar({ projects }: { projects: Project[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [showPicker, setShowPicker] = useState(false);

  const match = pathname.match(/\/dashboard\/projects\/([^/]+)/);
  const projectId = match?.[1];
  const currentProject = projectId ? projects.find((p) => p.id === projectId) : null;

  const currentTab = pathname.includes("/schedule")
    ? "schedule"
    : pathname.includes("/archive")
    ? "archive"
    : "kanban";

  const tabs = [
    {
      href: "/dashboard" as string | null,
      label: "홈",
      Icon: LayoutGrid,
      active: !projectId,
      fallbackPath: null,
    },
    {
      href: projectId ? `/dashboard/projects/${projectId}/kanban` : null,
      label: "칸반",
      Icon: FolderKanban,
      active: !!projectId && pathname.includes("/kanban"),
      fallbackPath: "kanban",
    },
    {
      href: projectId ? `/dashboard/projects/${projectId}/schedule` : null,
      label: "일정",
      Icon: CalendarDays,
      active: !!projectId && pathname.includes("/schedule"),
      fallbackPath: "schedule",
    },
    {
      href: projectId ? `/dashboard/projects/${projectId}/archive` : null,
      label: "아카이브",
      Icon: BookOpen,
      active: !!projectId && pathname.includes("/archive"),
      fallbackPath: "archive",
    },
  ];

  return (
    <>
      {/* 프로젝트 선택 시트 */}
      {showPicker && (
        <>
          <div
            className="md:hidden fixed inset-0 z-50 bg-black/40"
            onClick={() => setShowPicker(false)}
          />
          <div className="md:hidden fixed bottom-[5.25rem] left-0 right-0 z-50 bg-white rounded-t-2xl shadow-xl border-t border-gray-200 overflow-hidden">
            <div className="px-4 pt-4 pb-2 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-700">프로젝트 전환</span>
            </div>
            <div className="overflow-y-auto max-h-60 py-1">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setShowPicker(false);
                    router.push(`/dashboard/projects/${p.id}/${currentTab}`);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 transition-colors ${
                    p.id === projectId ? "bg-indigo-50" : "hover:bg-gray-50 active:bg-gray-100"
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                  <span className={`text-sm flex-1 text-left ${p.id === projectId ? "text-indigo-700 font-medium" : "text-gray-700"}`}>
                    {p.name}
                  </span>
                  {p.id === projectId && (
                    <span className="text-[10px] text-indigo-500 font-medium">현재</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-t border-gray-200"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* 현재 프로젝트 표시 (프로젝트 뷰일 때만) */}
        {currentProject && (
          <button
            onClick={() => setShowPicker((v) => !v)}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 border-b border-gray-100 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: currentProject.color }} />
            <span className="text-xs font-medium text-gray-600">{currentProject.name}</span>
            <ChevronUp size={11} className={`text-gray-400 transition-transform ${showPicker ? "" : "rotate-180"}`} />
          </button>
        )}

        <div className="flex h-14">
          {tabs.map(({ href, label, Icon, active, fallbackPath }) => {
            const fallback =
              !href && fallbackPath && projects.length > 0
                ? `/dashboard/projects/${projects[0].id}/${fallbackPath}`
                : null;

            return href || fallback ? (
              <Link
                key={label}
                href={(href ?? fallback)!}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors relative ${
                  active ? "text-indigo-600" : "text-gray-400 active:text-gray-600"
                } ${!href && fallback ? "opacity-50" : ""}`}
              >
                <Icon size={21} strokeWidth={active ? 2.5 : 2} />
                <span className={`text-[10px] font-medium ${active ? "text-indigo-600" : ""}`}>{label}</span>
                {active && <span className="absolute bottom-0 w-8 h-0.5 bg-indigo-500 rounded-t-full" />}
              </Link>
            ) : (
              <div
                key={label}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 text-gray-200 cursor-not-allowed select-none"
              >
                <Icon size={21} strokeWidth={2} />
                <span className="text-[10px] font-medium">{label}</span>
              </div>
            );
          })}
        </div>
      </nav>
    </>
  );
}
