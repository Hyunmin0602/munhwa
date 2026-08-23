"use client";

import Link from "next/link";
import dayjs from "dayjs";
import { BookOpen, CalendarDays, CheckSquare, ChevronRight, FileText, RotateCw, SlidersHorizontal, X } from "lucide-react";

type ItemType = "task" | "event" | "archive" | "meeting";

interface IntegratedItem {
  id: string;
  type: ItemType;
  title: string;
  timestamp: string;
  dueDate?: string | null;
  priority?: string;
  status?: string;
  visibility?: string;
  assigneeName?: string | null;
  authorName?: string | null;
  href: string;
  project: { id: string; name: string; color: string; status: string };
}

interface IntegratedSummary {
  counts: Record<ItemType, number>;
  kanban: Array<{
    project: { id: string; name: string; color: string; status: string };
    columns: Array<{
      id: string;
      name: string;
      order: number;
      tasks: Array<{ id: string; title: string; dueDate: string | null }>;
    }>;
  }>;
  events: IntegratedItem[];
  documents: IntegratedItem[];
  recentUpdates: IntegratedItem[];
}

interface Props {
  summary: IntegratedSummary;
  selectedProjectCount: number;
  onOpenFilters: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  onFocusType: (type: ItemType) => void;
  onShowAll: (type: ItemType) => void;
  projects: Array<{ id: string; name: string; color: string; status: string }>;
  showFilters: boolean;
  draftProjectIds: string[];
  onToggleProject: (projectId: string) => void;
  onResetProjectFilters: () => void;
  onApplyProjectFilters: () => void;
  onCloseFilters: () => void;
}

const typeDetails = {
  task: { Icon: CheckSquare, label: "작업" },
  event: { Icon: CalendarDays, label: "일정" },
  archive: { Icon: FileText, label: "문서" },
  meeting: { Icon: BookOpen, label: "회의록" },
};

const tabs: Array<{ type: "all" | ItemType; label: string }> = [
  { type: "all", label: "전체" },
  { type: "task", label: "칸반" },
  { type: "event", label: "일정" },
  { type: "archive", label: "문서" },
  { type: "meeting", label: "회의록" },
];

function SectionTitle({ title, count, onShowAll, countLabel = `전체 ${count}개`, actionLabel = "전체 보기" }: { title: string; count: number; onShowAll: () => void; countLabel?: string; actionLabel?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        <p className="mt-0.5 text-xs text-gray-400">{countLabel}</p>
      </div>
      <button
        type="button"
        onClick={onShowAll}
        className="inline-flex h-10 items-center gap-1 whitespace-nowrap text-sm font-medium text-indigo-600 hover:text-indigo-700"
      >
        {actionLabel} <ChevronRight size={15} />
      </button>
    </div>
  );
}

function ProjectDot({ item }: { item: IntegratedItem }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-gray-500">
      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: item.project.color }} />
      <span className="truncate">{item.project.name}</span>
    </span>
  );
}

function formatRecentUpdatedAt(timestamp: string) {
  const date = dayjs(timestamp);
  return date.isSame(dayjs(), "day") ? date.format("HH:mm") : date.format("M월 D일");
}

export default function IntegratedOverview({
  summary,
  selectedProjectCount,
  onOpenFilters,
  onRefresh,
  refreshing,
  onFocusType,
  onShowAll,
  projects,
  showFilters,
  draftProjectIds,
  onToggleProject,
  onResetProjectFilters,
  onApplyProjectFilters,
  onCloseFilters,
}: Props) {
  const { events, documents, recentUpdates } = summary;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-gray-100 bg-white px-4 py-4 md:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-xs text-gray-400">전체 사업의 업무 현황</p>
            <h1 className="text-xl font-bold text-gray-900 md:text-2xl">통합 화면</h1>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            <button type="button" onClick={onRefresh} disabled={refreshing} aria-label="통합 화면 새로고침" title="새로고침" className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-50"><RotateCw size={18} className={refreshing ? "animate-spin" : ""} /></button>
            <button
              type="button"
              onClick={onOpenFilters}
              aria-label="사업 필터 열기"
              title="사업 필터"
              className="relative flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            >
              <SlidersHorizontal size={18} />
              {selectedProjectCount > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-indigo-600" />}
            </button>
          </div>
        </div>
        <div className="-mx-4 mt-4 flex max-w-none snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 md:mx-auto md:max-w-6xl md:px-0">
          {tabs.map((tab) => (
            <button
              key={tab.type}
              type="button"
              onClick={() => tab.type !== "all" && onFocusType(tab.type)}
              className={`h-9 min-w-max flex-shrink-0 snap-start rounded-lg px-3 text-xs font-medium transition-colors ${tab.type === "all" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-5 pb-24 md:px-6 md:py-6 lg:px-8 lg:pb-8">
        <div className="mx-auto max-w-6xl space-y-8">
          <section>
            <div className="mb-3">
              <h2 className="text-base font-bold text-gray-900">최근 업데이트</h2>
              <p className="mt-0.5 text-xs text-gray-400">최근 변경된 항목 {recentUpdates.length}개</p>
            </div>
            {recentUpdates.length === 0 ? (
              <p className="py-6 text-sm text-gray-400">최근 업데이트가 없습니다.</p>
            ) : (
              <div className="divide-y divide-gray-100 border-y border-gray-100">
                {recentUpdates.map((item) => {
                  const { Icon, label } = typeDetails[item.type];
                  return (
                    <Link key={`${item.type}-${item.id}`} href={item.href} className="flex min-h-16 items-center gap-3 py-3 transition-colors hover:bg-gray-50">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg" style={{ color: item.project.color, backgroundColor: `${item.project.color}18` }}><Icon size={16} /></div>
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-gray-800">{item.title}</p><div className="mt-1 flex min-w-0 items-center gap-2"><ProjectDot item={item} /><span className="flex-shrink-0 text-xs text-gray-400">{formatRecentUpdatedAt(item.timestamp)}</span></div></div>
                      <span className="flex-shrink-0 text-[11px] font-medium text-gray-400">{label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <SectionTitle title="칸반 현황" count={summary.counts.task} onShowAll={() => onShowAll("task")} />
            {summary.kanban.length === 0 ? (
              <p className="py-6 text-sm text-gray-400">표시할 작업이 없습니다.</p>
            ) : (
              <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 xl:grid-cols-3">
                {summary.kanban.map(({ project, columns }) => {
                  return (
                    <article key={project.id} className="w-[19rem] flex-shrink-0 snap-start overflow-hidden rounded-lg border border-gray-200 bg-white md:w-auto">
                      <Link href={`/dashboard/projects/${project.id}/kanban`} className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 hover:bg-gray-50">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: project.color }} />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">{project.name}</span>
                        <ChevronRight size={15} className="text-gray-400" />
                      </Link>
                      <div className="grid grid-cols-3 divide-x divide-gray-100">
                        {columns.map((column) => {
                          return (
                            <div key={column.id} className="min-w-0 px-3 py-3">
                              <p className="truncate text-[11px] font-semibold text-gray-500">{column.name}</p>
                              <div className="mt-2 space-y-2">
                                {column.tasks.map((task) => (
                                  <Link key={task.id} href={`/dashboard/projects/${project.id}/kanban`} className="block truncate text-xs leading-5 text-gray-700 hover:text-indigo-700">
                                    {task.title}
                                  </Link>
                                ))}
                                {column.tasks.length === 0 && <p className="text-xs text-gray-300">비어 있음</p>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
            <section>
              <SectionTitle title="다가오는 일정" count={summary.counts.event} countLabel={`다가오는 7일 ${summary.counts.event}개`} onShowAll={() => onShowAll("event")} />
              <div className="divide-y divide-gray-100 border-y border-gray-100">
                {events.slice(0, 5).map((event) => (
                  <Link key={event.id} href={event.href} className="flex min-h-16 items-center gap-3 py-3 transition-colors hover:bg-gray-50">
                    <div className="w-11 flex-shrink-0 text-center">
                      <p className="text-[11px] font-medium text-indigo-600">{dayjs(event.dueDate ?? event.timestamp).format("M월")}</p>
                      <p className="text-lg font-bold leading-5 text-gray-800">{dayjs(event.dueDate ?? event.timestamp).format("D")}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-800">{event.title}</p>
                      <div className="mt-1 flex min-w-0 items-center gap-2">
                        <span className="text-xs text-gray-400">{dayjs(event.dueDate ?? event.timestamp).format("HH:mm")}</span>
                        <ProjectDot item={event} />
                      </div>
                    </div>
                    <ChevronRight size={16} className="flex-shrink-0 text-gray-300" />
                  </Link>
                ))}
                {events.length === 0 && <p className="py-6 text-sm text-gray-400">다가오는 일정이 없습니다.</p>}
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-gray-900">최근 문서와 회의록</h2>
                  <p className="mt-0.5 text-xs text-gray-400">전체 {summary.counts.archive + summary.counts.meeting}개</p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <button type="button" onClick={() => onShowAll("archive")} className="inline-flex h-10 items-center px-2 text-xs font-medium text-indigo-600 hover:text-indigo-700">문서</button>
                  <button type="button" onClick={() => onShowAll("meeting")} className="inline-flex h-10 items-center px-2 text-xs font-medium text-indigo-600 hover:text-indigo-700">회의록</button>
                </div>
              </div>
              <div className="divide-y divide-gray-100 border-y border-gray-100">
                {documents.slice(0, 5).map((document) => {
                  const { Icon, label } = typeDetails[document.type];
                  return (
                    <Link key={`${document.type}-${document.id}`} href={document.href} className="flex min-h-16 items-center gap-3 py-3 transition-colors hover:bg-gray-50">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg" style={{ color: document.project.color, backgroundColor: `${document.project.color}18` }}>
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-800">{document.title}</p>
                        <div className="mt-1 flex min-w-0 items-center gap-2">
                          <ProjectDot item={document} />
                          <span className="flex-shrink-0 text-xs text-gray-400">{dayjs(document.timestamp).format("M월 D일")}</span>
                        </div>
                      </div>
                      <span className="flex-shrink-0 text-[11px] font-medium text-gray-400">{label}</span>
                    </Link>
                  );
                })}
                {documents.length === 0 && <p className="py-6 text-sm text-gray-400">최근 문서가 없습니다.</p>}
              </div>
            </section>
          </div>
        </div>
      </main>
      {showFilters && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={onCloseFilters} />
          <section className="absolute bottom-0 left-0 right-0 max-h-[75vh] overflow-y-auto rounded-t-xl bg-white shadow-xl md:bottom-auto md:left-auto md:right-8 md:top-20 md:w-80 md:rounded-xl" aria-label="사업 필터">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">사업 필터</p>
                <p className="mt-0.5 text-xs text-gray-400">선택하지 않으면 전체 사업을 표시합니다.</p>
              </div>
              <button type="button" onClick={onCloseFilters} aria-label="필터 닫기" title="필터 닫기" className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="p-3">
              {projects.map((project) => {
                const selected = draftProjectIds.includes(project.id);
                return (
                  <button key={project.id} type="button" onClick={() => onToggleProject(project.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm ${selected ? "bg-indigo-50 text-indigo-700" : "text-gray-700 hover:bg-gray-50"}`}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: project.color }} />
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    <span className={`flex h-5 w-5 items-center justify-center rounded border ${selected ? "border-indigo-600 bg-indigo-600 text-white" : "border-gray-300"}`}>{selected && "✓"}</span>
                  </button>
                );
              })}
            </div>
            <div className="sticky bottom-0 flex gap-2 border-t border-gray-100 bg-white p-4">
              <button type="button" onClick={onResetProjectFilters} className="flex-1 rounded-lg bg-gray-100 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200">초기화</button>
              <button type="button" onClick={onApplyProjectFilters} className="flex-1 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500">적용</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
