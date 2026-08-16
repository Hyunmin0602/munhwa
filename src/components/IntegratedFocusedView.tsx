"use client";

import Link from "next/link";
import dayjs from "dayjs";
import { AlertCircle, BookOpen, CalendarDays, CheckSquare, ChevronRight, FileText, RotateCw, SlidersHorizontal, X } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";

type ItemType = "task" | "event" | "archive" | "meeting";

type IntegratedItem = {
  id: string;
  type: ItemType;
  title: string;
  timestamp: string;
  dueDate?: string | null;
  priority?: string;
  status?: string;
  authorName?: string | null;
  href: string;
  project: { id: string; name: string; color: string; status: string };
};

type ProjectFilter = { id: string; name: string; color: string; status: string };

type Props = {
  type: ItemType;
  items: IntegratedItem[];
  range: string;
  loading: boolean;
  error: string | null;
  nextCursor: string | null;
  loadingMore: boolean;
  loadMoreError: string | null;
  selectedProjectCount: number;
  projects: ProjectFilter[];
  showFilters: boolean;
  draftProjectIds: string[];
  onSelectType: (type: "all" | ItemType) => void;
  onSelectRange: (range: string) => void;
  onOpenFilters: () => void;
  onCloseFilters: () => void;
  onToggleProject: (projectId: string) => void;
  onResetProjectFilters: () => void;
  onApplyProjectFilters: () => void;
  onRetry: () => void;
  onLoadMore: () => void;
};

const tabs: Array<{ type: "all" | ItemType; label: string }> = [
  { type: "all", label: "전체" },
  { type: "task", label: "칸반" },
  { type: "event", label: "일정" },
  { type: "archive", label: "문서" },
  { type: "meeting", label: "회의록" },
];

const typeConfig = {
  task: { title: "마감 작업", empty: "해당 기간에 마감인 작업이 없습니다.", Icon: CheckSquare },
  event: { title: "일정", empty: "해당 기간에 예정된 일정이 없습니다.", Icon: CalendarDays },
  archive: { title: "문서", empty: "해당 기간에 수정된 문서가 없습니다.", Icon: FileText },
  meeting: { title: "회의록", empty: "해당 기간에 수정된 회의록이 없습니다.", Icon: BookOpen },
};

function rangeOptions(type: ItemType) {
  const isDocument = type === "archive" || type === "meeting";
  return [
    { value: "today", label: isDocument ? "오늘 수정" : "오늘" },
    { value: "7d", label: isDocument ? "최근 7일" : "다음 7일" },
    { value: "30d", label: isDocument ? "최근 30일" : "다음 30일" },
    { value: "all", label: "전체" },
  ];
}

function ProjectName({ item }: { item: IntegratedItem }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-gray-500">
      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: item.project.color }} />
      <span className="truncate">{item.project.name}</span>
    </span>
  );
}

export default function IntegratedFocusedView({
  type,
  items,
  range,
  loading,
  error,
  nextCursor,
  loadingMore,
  loadMoreError,
  selectedProjectCount,
  projects,
  showFilters,
  draftProjectIds,
  onSelectType,
  onSelectRange,
  onOpenFilters,
  onCloseFilters,
  onToggleProject,
  onResetProjectFilters,
  onApplyProjectFilters,
  onRetry,
  onLoadMore,
}: Props) {
  const { title, empty, Icon } = typeConfig[type];
  const isDocument = type === "archive" || type === "meeting";

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-gray-100 bg-white px-4 py-4 md:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-xs text-gray-400">참여 중인 전체 사업</p>
            <h1 className="text-xl font-bold text-gray-900 md:text-2xl">{title}</h1>
          </div>
          <button type="button" onClick={onOpenFilters} aria-label="사업 필터 열기" title="사업 필터" className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800">
            <SlidersHorizontal size={18} />
            {selectedProjectCount > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-indigo-600" />}
          </button>
        </div>
        <div className="mx-auto mt-4 flex max-w-6xl gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1">
          {tabs.map((tab) => <button key={tab.type} type="button" onClick={() => onSelectType(tab.type)} className={`min-w-max rounded-md px-3 py-2 text-xs font-medium transition-colors ${type === tab.type ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}>{tab.label}</button>)}
        </div>
        <div className="mx-auto mt-3 flex max-w-6xl gap-2 overflow-x-auto pb-1">
          {rangeOptions(type).map((option) => <button key={option.value} type="button" onClick={() => onSelectRange(option.value)} className={`h-9 min-w-max rounded-lg px-3 text-xs font-medium ${range === option.value ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{option.label}</button>)}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-5 pb-24 md:px-6 md:py-6 lg:px-8 lg:pb-8">
        <div className="mx-auto max-w-4xl">
          {loading ? <div className="divide-y divide-gray-100 border-y border-gray-100">{[...Array(6)].map((_, index) => <Skeleton key={index} className="my-3 h-14 rounded" />)}</div> : error ? <div className="flex h-64 flex-col items-center justify-center text-center"><AlertCircle size={28} className="mb-3 text-rose-400" /><p className="font-medium text-gray-700">{error}</p><button type="button" onClick={onRetry} className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-600 hover:bg-gray-50"><RotateCw size={14} />다시 시도</button></div> : items.length === 0 ? <div className="flex h-64 flex-col items-center justify-center text-center"><Icon size={28} className="mb-3 text-gray-300" /><p className="font-medium text-gray-600">{empty}</p></div> : <div className="divide-y divide-gray-100 border-y border-gray-100">{items.map((item) => {
            const date = dayjs(item.dueDate ?? item.timestamp);
            if (type === "event") return <Link key={item.id} href={item.href} className="flex min-h-20 items-center gap-4 py-3 transition-colors hover:bg-gray-50"><div className="w-12 flex-shrink-0 text-center"><p className="text-[11px] font-medium text-indigo-600">{date.format("M월")}</p><p className="text-xl font-bold leading-6 text-gray-800">{date.format("D")}</p></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-gray-900">{item.title}</p><div className="mt-1 flex min-w-0 items-center gap-2"><span className="flex-shrink-0 text-xs text-gray-400">{date.format("HH:mm")}</span><ProjectName item={item} /></div></div><ChevronRight size={16} className="flex-shrink-0 text-gray-300" /></Link>;
            if (isDocument) return <Link key={item.id} href={item.href} className="flex min-h-16 items-center gap-3 py-3 transition-colors hover:bg-gray-50"><div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg" style={{ color: item.project.color, backgroundColor: `${item.project.color}18` }}><Icon size={16} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-gray-900">{item.title}</p><div className="mt-1 flex min-w-0 items-center gap-2"><ProjectName item={item} /><span className="flex-shrink-0 text-xs text-gray-400">{dayjs(item.timestamp).format("M월 D일")}</span></div></div><span className="flex-shrink-0 text-[11px] font-medium text-gray-400">{type === "meeting" ? "회의록" : "문서"}</span></Link>;
            const priority = item.priority === "high" ? "높음" : item.priority === "low" ? "낮음" : "보통";
            return <Link key={item.id} href={item.href} className="flex min-h-16 items-center gap-3 py-3 transition-colors hover:bg-gray-50"><div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg" style={{ color: item.project.color, backgroundColor: `${item.project.color}18` }}><CheckSquare size={16} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-gray-900">{item.title}</p><div className="mt-1 flex min-w-0 items-center gap-2"><ProjectName item={item} /><span className="flex-shrink-0 text-xs text-gray-400">{item.dueDate ? date.format("M월 D일") : "마감일 없음"}</span></div></div><div className="flex flex-shrink-0 flex-col items-end gap-1"><span className="text-[11px] font-medium text-gray-500">{item.status}</span><span className="text-[11px] text-gray-400">{priority}</span></div></Link>;
          })}</div>}
          {nextCursor && !loading && !error && <div className="mt-5 flex flex-col items-center gap-2"><button type="button" onClick={onLoadMore} disabled={loadingMore} className="h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">{loadingMore ? "불러오는 중..." : "더 불러오기"}</button>{loadMoreError && <p className="text-xs text-rose-500">{loadMoreError}</p>}</div>}
        </div>
      </main>

      {showFilters && <div className="fixed inset-0 z-50"><div className="absolute inset-0 bg-black/40" onClick={onCloseFilters} /><section className="absolute bottom-0 left-0 right-0 max-h-[75vh] overflow-y-auto rounded-t-xl bg-white shadow-xl md:bottom-auto md:left-auto md:right-8 md:top-20 md:w-80 md:rounded-xl" aria-label="사업 필터"><div className="flex items-center justify-between border-b border-gray-100 px-5 py-4"><div><p className="text-sm font-semibold text-gray-900">사업 필터</p><p className="mt-0.5 text-xs text-gray-400">선택하지 않으면 전체 사업을 표시합니다.</p></div><button type="button" onClick={onCloseFilters} aria-label="필터 닫기" title="필터 닫기" className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X size={18} /></button></div><div className="p-3">{projects.map((project) => { const selected = draftProjectIds.includes(project.id); return <button key={project.id} type="button" onClick={() => onToggleProject(project.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm ${selected ? "bg-indigo-50 text-indigo-700" : "text-gray-700 hover:bg-gray-50"}`}><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: project.color }} /><span className="min-w-0 flex-1 truncate">{project.name}</span><span className={`flex h-5 w-5 items-center justify-center rounded border ${selected ? "border-indigo-600 bg-indigo-600 text-white" : "border-gray-300"}`}>{selected && "✓"}</span></button>; })}</div><div className="sticky bottom-0 flex gap-2 border-t border-gray-100 bg-white p-4"><button type="button" onClick={onResetProjectFilters} className="flex-1 rounded-lg bg-gray-100 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200">초기화</button><button type="button" onClick={onApplyProjectFilters} className="flex-1 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500">적용</button></div></section></div>}
    </div>
  );
}
