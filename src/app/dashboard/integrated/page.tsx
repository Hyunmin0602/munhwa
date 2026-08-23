"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import dayjs from "dayjs";
import { AlertCircle, BookOpen, CalendarDays, CheckSquare, FileText, RotateCw, SlidersHorizontal, X } from "lucide-react";
import { apiFetch } from "@/lib/client-fetch";
import { Skeleton } from "@/components/ui/Skeleton";
import IntegratedFocusedView from "@/components/IntegratedFocusedView";
import IntegratedOverview from "@/components/IntegratedOverview";

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
interface ProjectFilter {
  id: string;
  name: string;
  color: string;
  status: string;
}
interface IntegratedSummary {
  counts: Record<ItemType, number>;
  kanban: Array<{
    project: { id: string; name: string; color: string; status: string };
    columns: Array<{ id: string; name: string; order: number; tasks: Array<{ id: string; title: string; dueDate: string | null }> }>;
  }>;
  events: IntegratedItem[];
  documents: IntegratedItem[];
  recentUpdates: IntegratedItem[];
}

const tabs: Array<{ type: "all" | ItemType; label: string }> = [
  { type: "all", label: "전체" }, { type: "task", label: "칸반" }, { type: "event", label: "일정" }, { type: "archive", label: "문서" }, { type: "meeting", label: "회의록" },
];
const typeDetails = {
  task: { Icon: CheckSquare, label: "작업" },
  event: { Icon: CalendarDays, label: "일정" },
  archive: { Icon: FileText, label: "문서" },
  meeting: { Icon: BookOpen, label: "회의록" },
};

export default function IntegratedPage() {
  const searchParams = useSearchParams();
  const initialType = searchParams.get("type") ?? searchParams.get("types")?.split(",")[0];
  const initialRange = searchParams.get("range");
  const [type, setType] = useState<"all" | ItemType>(() => tabs.some((tab) => tab.type === initialType) ? initialType as "all" | ItemType : "all");
  const [range, setRange] = useState(() => ["today", "7d", "30d", "all"].includes(initialRange ?? "") ? initialRange! : "7d");
  const [items, setItems] = useState<IntegratedItem[]>([]);
  const [summary, setSummary] = useState<IntegratedSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectFilter[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>(() => searchParams.get("projectIds")?.split(",").filter(Boolean) ?? []);
  const [draftProjectIds, setDraftProjectIds] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [requestNonce, setRequestNonce] = useState(0);
  const pathname = usePathname();
  const router = useRouter();

  const getQuery = useCallback((cursor?: string) => {
    const query = new URLSearchParams();
    query.set("range", range);
    if (type !== "all") query.set("type", type);
    if (selectedProjectIds.length) query.set("projectIds", selectedProjectIds.join(","));
    if (cursor) query.set("cursor", cursor);
    return query;
  }, [range, selectedProjectIds, type]);

  const syncUrl = (nextType: "all" | ItemType, nextRange: string, nextProjectIds: string[]) => {
    const query = new URLSearchParams();
    query.set("range", nextRange);
    if (nextType !== "all") query.set("type", nextType);
    if (nextProjectIds.length) query.set("projectIds", nextProjectIds.join(","));
    router.replace(`${pathname}?${query}`, { scroll: false });
  };

  const selectType = (nextType: "all" | ItemType) => {
    setLoading(true);
    setError(null);
    setType(nextType);
    syncUrl(nextType, range, selectedProjectIds);
  };

  const showAllOfType = (nextType: ItemType) => {
    setLoading(true);
    setError(null);
    setType(nextType);
    setRange("all");
    syncUrl(nextType, "all", selectedProjectIds);
  };

  const selectRange = (nextRange: string) => {
    setLoading(true);
    setError(null);
    setRange(nextRange);
    syncUrl(type, nextRange, selectedProjectIds);
  };

  const openFilters = () => {
    setDraftProjectIds(selectedProjectIds);
    setShowFilters(true);
  };

  const toggleDraftProject = (projectId: string) => {
    setDraftProjectIds((current) => current.includes(projectId) ? current.filter((id) => id !== projectId) : [...current, projectId]);
  };

  const applyProjectFilters = () => {
    setLoading(true);
    setError(null);
    setSelectedProjectIds(draftProjectIds);
    syncUrl(type, range, draftProjectIds);
    setShowFilters(false);
  };

  const retry = () => {
    setLoading(true);
    setError(null);
    setRequestNonce((current) => current + 1);
  };

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const response = await apiFetch(`/api/dashboard/integrated?${getQuery(nextCursor)}`);
      const data = await response.json();
      setItems((current) => [...current, ...(Array.isArray(data.items) ? data.items : [])]);
      setNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
    } catch {
      setLoadMoreError("추가 업무를 불러오지 못했습니다.");
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/dashboard/integrated?${getQuery()}`)
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        setItems(Array.isArray(data.items) ? data.items : []);
        setSummary(data.summary && typeof data.summary === "object" ? data.summary : null);
        setProjects(Array.isArray(data.filters?.projects) ? data.filters.projects : []);
        setNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
      })
      .catch(() => {
        if (!cancelled) setError("통합 업무를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [getQuery, requestNonce]);

  if (type !== "all") {
    return (
      <IntegratedFocusedView
        type={type}
        items={items}
        range={range}
        loading={loading}
        error={error}
        nextCursor={nextCursor}
        loadingMore={loadingMore}
        loadMoreError={loadMoreError}
        selectedProjectCount={selectedProjectIds.length}
        projects={projects}
        showFilters={showFilters}
        draftProjectIds={draftProjectIds}
        onSelectType={selectType}
        onSelectRange={selectRange}
        onOpenFilters={openFilters}
        onCloseFilters={() => setShowFilters(false)}
        onToggleProject={toggleDraftProject}
        onResetProjectFilters={() => setDraftProjectIds([])}
        onApplyProjectFilters={applyProjectFilters}
        onRetry={retry}
        onLoadMore={loadMore}
      />
    );
  }

  if (!error && summary && type === "all") {
    return (
      <IntegratedOverview
        summary={summary}
        range={range}
        selectedProjectCount={selectedProjectIds.length}
        onOpenFilters={openFilters}
        onSelectRange={selectRange}
        onFocusType={selectType}
        onShowAll={showAllOfType}
        projects={projects}
        showFilters={showFilters}
        draftProjectIds={draftProjectIds}
        onToggleProject={toggleDraftProject}
        onResetProjectFilters={() => setDraftProjectIds([])}
        onApplyProjectFilters={applyProjectFilters}
        onCloseFilters={() => setShowFilters(false)}
      />
    );
  }

  if (type === "all") {
    return (
      <div className="flex h-full flex-col">
        <header className="border-b border-gray-100 bg-white px-4 py-4 md:px-6 lg:px-8">
          <div className="mx-auto flex max-w-6xl items-start justify-between gap-3">
            <div><p className="mb-1 text-xs text-gray-400">참여 중인 전체 사업</p><h1 className="text-xl font-bold text-gray-900 md:text-2xl">통합 화면</h1></div>
            <button type="button" onClick={openFilters} aria-label="사업 필터 열기" title="사업 필터" className="relative flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800"><SlidersHorizontal size={18} />{selectedProjectIds.length > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-indigo-600" />}</button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-4 py-5 md:px-6 md:py-6 lg:px-8"><div className="mx-auto max-w-6xl">{error ? <div className="flex h-64 flex-col items-center justify-center text-center"><AlertCircle size={28} className="mb-3 text-rose-400" /><p className="font-medium text-gray-700">{error}</p><button type="button" onClick={retry} className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-600 hover:bg-gray-50"><RotateCw size={14} />다시 시도</button></div> : <div className="space-y-3">{[...Array(5)].map((_, index) => <Skeleton key={index} className="h-16 rounded" />)}</div>}</div></main>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-gray-100 bg-white px-4 py-4 md:px-8 md:py-6">
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-3">
          <div><p className="mb-1 text-xs text-gray-400">참여 중인 전체 사업</p><h1 className="text-xl font-bold text-gray-900 md:text-2xl">통합 화면</h1></div>
          <button onClick={openFilters} aria-label="필터 열기" title="필터" className="relative flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800"><SlidersHorizontal size={18} />{selectedProjectIds.length > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-indigo-600" />}</button>
        </div>
        <div className="mx-auto mt-4 flex max-w-6xl gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1">
          {tabs.map((tab) => <button key={tab.type} onClick={() => selectType(tab.type)} className={`min-w-max rounded-md px-3 py-2 text-xs font-medium transition-colors ${type === tab.type ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}>{tab.label}</button>)}
        </div>
      </header>
      <main className="flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 flex gap-2 overflow-x-auto">
            {[{ value: "today", label: "오늘" }, { value: "7d", label: "다음 7일" }, { value: "30d", label: "다음 30일" }, { value: "all", label: "전체" }].map((option) => <button key={option.value} onClick={() => selectRange(option.value)} className={`min-w-14 rounded-full px-3 py-1.5 text-xs font-medium ${range === option.value ? "bg-indigo-600 text-white" : "bg-white text-gray-500 ring-1 ring-gray-200 hover:bg-gray-50"}`}>{option.label}</button>)}
          </div>
          {loading ? <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">{[...Array(6)].map((_, index) => <Skeleton key={index} className="mx-4 my-3 h-12 rounded" />)}</div> : error ? <div className="flex h-64 flex-col items-center justify-center text-center"><AlertCircle size={28} className="mb-3 text-rose-400" /><p className="font-medium text-gray-700">{error}</p><button onClick={retry} className="mt-3 flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"><RotateCw size={14} />다시 시도</button></div> : items.length === 0 ? <div className="flex h-64 flex-col items-center justify-center text-center"><CalendarDays size={28} className="mb-3 text-gray-300" /><p className="font-medium text-gray-600">표시할 업무가 없습니다</p><p className="mt-1 text-sm text-gray-400">기간이나 유형을 바꿔 다시 확인하세요.</p></div> : <><div className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">{items.map((item) => { const { Icon, label } = typeDetails[item.type]; return <Link key={`${item.type}-${item.id}`} href={item.href} className="flex min-h-[72px] items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50"><div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg" style={{ color: item.project.color, backgroundColor: `${item.project.color}18` }}><Icon size={17} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-gray-900">{item.title}</p><p className="mt-1 truncate text-xs text-gray-400"><span className="font-medium text-gray-600">{item.project.name}</span> · {item.dueDate ? dayjs(item.dueDate).format("M월 D일") : dayjs(item.timestamp).format("M월 D일")} · {item.assigneeName ?? item.authorName ?? label}</p></div><span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{item.status ?? label}</span></Link>; })}</div>{nextCursor && <div className="mt-4 flex flex-col items-center gap-2"><button onClick={loadMore} disabled={loadingMore} className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">{loadingMore ? "불러오는 중..." : "더 불러오기"}</button>{loadMoreError && <button onClick={loadMore} className="text-xs font-medium text-rose-600 hover:text-rose-700">{loadMoreError} 다시 시도</button>}</div>}</>}
        </div>
      </main>
      {showFilters && <div className="fixed inset-0 z-50"><div className="absolute inset-0 bg-black/40" onClick={() => setShowFilters(false)} /><section className="absolute bottom-0 left-0 right-0 max-h-[75vh] overflow-y-auto rounded-t-xl bg-white shadow-xl md:bottom-auto md:left-auto md:right-8 md:top-20 md:w-80 md:rounded-xl" aria-label="사업 필터"><div className="flex items-center justify-between border-b border-gray-100 px-5 py-4"><div><p className="text-sm font-semibold text-gray-900">사업 필터</p><p className="mt-0.5 text-xs text-gray-400">선택하지 않으면 전체 사업을 표시합니다.</p></div><button onClick={() => setShowFilters(false)} aria-label="필터 닫기" className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X size={18} /></button></div><div className="p-3">{projects.map((project) => { const selected = draftProjectIds.includes(project.id); return <button key={project.id} onClick={() => toggleDraftProject(project.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm ${selected ? "bg-indigo-50 text-indigo-700" : "text-gray-700 hover:bg-gray-50"}`}><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: project.color }} /><span className="min-w-0 flex-1 truncate">{project.name}</span><span className={`flex h-5 w-5 items-center justify-center rounded border ${selected ? "border-indigo-600 bg-indigo-600 text-white" : "border-gray-300"}`}>{selected && "✓"}</span></button>; })}</div><div className="sticky bottom-0 flex gap-2 border-t border-gray-100 bg-white p-4"><button onClick={() => setDraftProjectIds([])} className="flex-1 rounded-lg bg-gray-100 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200">초기화</button><button onClick={applyProjectFilters} className="flex-1 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500">적용</button></div></section></div>}
    </div>
  );
}