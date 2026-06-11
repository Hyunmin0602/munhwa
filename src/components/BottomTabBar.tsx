"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, FolderKanban, CalendarDays, BookOpen } from "lucide-react";

interface Project { id: string; name: string; color: string; }

export default function BottomTabBar({ projects }: { projects: Project[] }) {
  const pathname = usePathname();
  const match = pathname.match(/\/dashboard\/projects\/([^/]+)/);
  const projectId = match?.[1];

  const tabs = [
    {
      href: "/dashboard" as string | null,
      label: "홈",
      Icon: LayoutGrid,
      active: !projectId,
    },
    {
      href: projectId ? `/dashboard/projects/${projectId}/kanban` : null,
      label: "칸반",
      Icon: FolderKanban,
      active: !!projectId && pathname.includes("/kanban"),
    },
    {
      href: projectId ? `/dashboard/projects/${projectId}/schedule` : null,
      label: "일정",
      Icon: CalendarDays,
      active: !!projectId && pathname.includes("/schedule"),
    },
    {
      href: projectId ? `/dashboard/projects/${projectId}/archive` : null,
      label: "아카이브",
      Icon: BookOpen,
      active: !!projectId && pathname.includes("/archive"),
    },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-t border-gray-200"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex h-14">
        {tabs.map(({ href, label, Icon, active }) =>
          href ? (
            <Link
              key={label}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                active ? "text-indigo-600" : "text-gray-400 active:text-gray-600"
              }`}
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
          )
        )}
      </div>
    </nav>
  );
}
