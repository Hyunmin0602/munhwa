"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  FolderKanban,
  CalendarDays,
  BookOpen,
  LogOut,
  ChevronRight,
  Plus,
  Pencil,
  X,
} from "lucide-react";

interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string;
}

interface SidebarProps {
  projects: Project[];
  onNewProject: () => void;
  onEditProject: (project: Project) => void;
  open?: boolean;
  onClose?: () => void;
}

function SidebarContent({ projects, onNewProject, onEditProject, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside className="w-64 bg-white flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">문화체육위원회</h1>
          <p className="text-xs text-gray-400 mt-0.5">내부 업무 관리</p>
        </div>
        {/* 모바일 닫기 버튼 */}
        {onClose && (
          <button onClick={onClose} className="md:hidden p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <div className="mt-4">
          <div className="flex items-center justify-between px-3 py-1 mb-1">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">사업</span>
            <button
              onClick={onNewProject}
              className="text-gray-400 hover:text-indigo-600 transition-colors"
              title="새 사업 추가"
            >
              <Plus size={14} />
            </button>
          </div>
          {projects.map((p) => {
            const base = `/dashboard/projects/${p.id}`;
            const isActive = pathname.startsWith(base);
            return (
              <div key={p.id}>
                <div
                  className={`group flex items-center rounded-lg transition-colors ${
                    isActive ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <Link
                    href={`${base}/kanban`}
                    onClick={onClose}
                    className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-sm"
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                    <span className="truncate flex-1">{p.name}</span>
                    {isActive && <ChevronRight size={12} className="flex-shrink-0" />}
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      onEditProject(p);
                      onClose?.();
                    }}
                    className={`mr-1 rounded-md p-1.5 transition-all ${
                      isActive
                        ? "text-indigo-500 hover:bg-indigo-100"
                        : "text-gray-300 hover:bg-white hover:text-gray-600 md:opacity-0 md:group-hover:opacity-100"
                    }`}
                    title="사업 수정"
                  >
                    <Pencil size={12} />
                  </button>
                </div>
                {isActive && (
                  <div className="ml-6 mt-0.5 space-y-0.5">
                    {[
                      { href: `${base}/kanban`, label: "칸반", Icon: FolderKanban },
                      { href: `${base}/schedule`, label: "일정", Icon: CalendarDays },
                      { href: `${base}/archive`, label: "아카이브", Icon: BookOpen },
                    ].map(({ href, label, Icon: SubIcon }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={onClose}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                          pathname === href ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-500 hover:bg-gray-50"
                        }`}
                      >
                        <SubIcon size={13} />
                        {label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* User info */}
      <div className="px-3 py-4 border-t border-gray-100">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold flex-shrink-0">
            {session?.user?.name?.[0] ?? "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{session?.user?.name ?? "사용자"}</p>
            <p className="text-xs text-gray-400 truncate">{session?.user?.email}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-gray-400 hover:text-red-500 transition-colors"
            title="로그아웃"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}

export default function Sidebar({ projects, onNewProject, onEditProject, open = false, onClose }: SidebarProps) {
  return (
    <>
      {/* 데스크탑 사이드바 */}
      <div className="hidden md:flex border-r border-gray-200 h-screen sticky top-0">
        <SidebarContent projects={projects} onNewProject={onNewProject} onEditProject={onEditProject} />
      </div>

      {/* 모바일 오버레이 드로어 */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={onClose} />
          {/* drawer */}
          <div className="absolute left-0 top-0 h-full shadow-xl">
            <SidebarContent
              projects={projects}
              onNewProject={onNewProject}
              onEditProject={onEditProject}
              onClose={onClose}
            />
          </div>
        </div>
      )}
    </>
  );
}
