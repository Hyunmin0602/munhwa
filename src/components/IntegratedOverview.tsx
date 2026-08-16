"use client";

import Link from "next/link";
import dayjs from "dayjs";
import { BookOpen, CalendarDays, CheckSquare, ChevronRight, FileText, SlidersHorizontal } from "lucide-react";

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
}

interface Props {
  items: IntegratedItem[];
  summary: IntegratedSummary;
  range: string;
  selectedProjectCount: number;
  onOpenFilters: () => void;
  onSelectRange: (range: string) => void;
  onFocusType: (type: ItemType) => void;
}

const ranges = [
  { value: "today", label: "오늘" },
  { value: "7d", label: "7일" },
  { value: "30d", label: "30일" },
  { value: "all", label: "전체" },
];

const typeDetails = {
  task: { Icon: CheckSquare, label: "작업" },
  event: { Icon: CalendarDays, label: "일정" },
  archive: { Icon: FileText, label: "문서" },
  meeting: { Icon: BookOpen, label: "회의록" },
};

function SectionTitle({ title, count, onShowAll, actionLabel = "전체 보기" }: { title: string; count: number; onShowAll: () => void; actionLabel?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        <p className="mt-0.5 text-xs text-gray-400">전체 {count}개</p>
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

export default function IntegratedOverview({
  items,
  summary,
  range,
  selectedProjectCount,
  onOpenFilters,
  onSelectRange,
  onFocusType,
}: Props) {
  const events = items.filter((item) => item.type === "event");
  const documents = items.filter((item) => item.type === "archive" || item.type === "meeting");

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-gray-100 bg-white px-4 py-4 md:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-xs text-gray-400">전체 사업의 업무 현황</p>
            <h1 className="text-xl font-bold text-gray-900 md:text-2xl">통합 화면</h1>
          </div>
          <button
            type="button"
            onClick={onOpenFilters}
            aria-label="사업 필터 열기"
            title="사업 필터"
            className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            <SlidersHorizontal size={18} />
            {selectedProjectCount > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-indigo-600" />}
          </button>
        </div>
        <div className="mx-auto mt-4 flex max-w-6xl gap-2 overflow-x-auto pb-1">
          {ranges.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelectRange(option.value)}
              className={`h-9 min-w-14 rounded-lg px-3 text-xs font-medium transition-colors ${range === option.value ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-5 pb-24 md:px-6 md:py-6 lg:px-8 lg:pb-8">
        <div className="mx-auto max-w-6xl space-y-8">
          <section>
            <SectionTitle title="칸반 현황" count={summary.counts.task} onShowAll={() => onFocusType("task")} />
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
              <SectionTitle title="다가오는 일정" count={summary.counts.event} onShowAll={() => onFocusType("event")} />
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
                  <button type="button" onClick={() => onFocusType("archive")} className="inline-flex h-10 items-center px-2 text-xs font-medium text-indigo-600 hover:text-indigo-700">문서</button>
                  <button type="button" onClick={() => onFocusType("meeting")} className="inline-flex h-10 items-center px-2 text-xs font-medium text-indigo-600 hover:text-indigo-700">회의록</button>
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
    </div>
  );
}
