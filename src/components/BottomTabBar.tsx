"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, FolderKanban, CalendarDays, BookOpen, ChevronDown } from "lucide-react";

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

  const tabs = projectId
    ? [
        { href: `/dashboard/projects/${projectId}/kanban`, label: "칸반", Icon: FolderKanban, active: currentTab === "kanban" },
        { href: `/dashboard/projects/${projectId}/schedule`, label: "일정", Icon: CalendarDays, active: currentTab === "schedule" },
        { href: `/dashboard/projects/${projectId}/archive`, label: "아카이브", Icon: BookOpen, active: currentTab === "archive" },
      ]
    : [
        { href: "/dashboard/integrated", label: "통합", Icon: LayoutDashboard, active: pathname === "/dashboard/integrated" },
        { href: "/dashboard/projects", label: "사업", Icon: FolderKanban, active: pathname === "/dashboard/projects" },
        { href: "/dashboard/meetings", label: "회의록", Icon: BookOpen, active: pathname === "/dashboard/meetings" },
      ];

  return (
    <>
      {/* 프로젝트 선택 시트 */}
      {showPicker && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-50 bg-black/40"
            onClick={() => setShowPicker(false)}
          />
          <div className="lg:hidden fixed bottom-[5.25rem] left-0 right-0 z-50 bg-white rounded-t-2xl shadow-xl border-t border-gray-200 overflow-hidden">
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
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-t border-gray-200"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* 현재 프로젝트 표시 (프로젝트 뷰일 때만) */}
        {currentProject && (
          <button
            onClick={() => setShowPicker((v) => !v)}
            className="w-full flex items-center gap-2 px-4 py-2 border-b border-gray-100 hover:bg-gray-50 active:bg-gray-100 transition-colors"
            aria-expanded={showPicker}
          >
            <span className="text-[10px] font-semibold text-indigo-600">사업 전환</span>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: currentProject.color }} />
            <span className="flex-1 truncate text-left text-xs font-medium text-gray-700">{currentProject.name}</span>
            <ChevronDown size={14} className={`text-gray-400 transition-transform ${showPicker ? "rotate-180" : ""}`} />
          </button>
        )}

        <div className="flex h-14">
          {tabs.map(({ href, label, Icon, active }) => (
            <Link
              key={label}
              href={href}
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${
                active ? "text-indigo-600" : "text-gray-400 active:text-gray-600"
              }`}
            >
              <Icon size={21} strokeWidth={active ? 2.5 : 2} />
              <span className={`text-[10px] font-medium ${active ? "text-indigo-600" : ""}`}>{label}</span>
              {active && <span className="absolute bottom-0 h-0.5 w-8 rounded-t-full bg-indigo-500" />}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
