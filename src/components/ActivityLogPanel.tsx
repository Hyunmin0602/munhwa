"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronRight, RefreshCw, Search } from "lucide-react";
import { apiFetch } from "@/lib/client-fetch";
import { activityActions, activityChanges, activityData, activityDateRange, activityFieldLabel, activityTime, activityTypes, activityValue, type ActivityDetail, type ActivitySummary } from "@/lib/activity-log-display";
import ModalFrame, { ModalCloseButton } from "@/components/ui/ModalFrame";

type Filters = { query: string; type: string; action: string; actor: string; project: string; from: string; to: string; order: string };
const emptyFilters: Filters = { query: "", type: "", action: "", actor: "", project: "", from: "", to: "", order: "desc" };
const inputClass = "min-h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";
const buttonClass = "min-h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50";

async function responseError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  return typeof payload?.error?.message === "string" ? payload.error.message : fallback;
}

function logParams(filters: Filters, cursor?: string) {
  const params = new URLSearchParams({ limit: "30" });
  for (const [key, value] of Object.entries(filters)) if (value.trim()) params.set(key, value.trim());
  if (cursor) params.set("cursor", cursor);
  return params;
}

function actorName(log: ActivitySummary) { return log.actor.name?.trim() || log.actor.email; }
function projectName(log: ActivitySummary) { return log.project?.name ?? (log.entityType === "PROJECT" && log.action === "삭제" ? "삭제된 사업" : "부서"); }

export default function ActivityLogPanel() {
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [logs, setLogs] = useState<ActivitySummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<ActivitySummary | null>(null);
  const request = useRef<AbortController | null>(null);
  const version = useRef(0);
  const morePending = useRef(false);

  useEffect(() => {
    const currentVersion = ++version.current;
    const controller = new AbortController();
    request.current = controller;
    morePending.current = false;
    const load = async () => {
      setLoading(true); setLoadingMore(false); setError(null); setLogs([]); setCursor(null);
      try {
        const response = await apiFetch(`/api/space-management/logs?${logParams(filters)}`, { signal: controller.signal }, { showGlobalError: false, retries: 0 });
        if (!response.ok) throw new Error(await responseError(response, "활동 로그를 불러오지 못했습니다."));
        const payload = await response.json();
        if (controller.signal.aborted || currentVersion !== version.current) return;
        setLogs(Array.isArray(payload.items) ? payload.items : []);
        setCursor(typeof payload.nextCursor === "string" ? payload.nextCursor : null);
      } catch (cause) {
        if (!controller.signal.aborted && currentVersion === version.current) setError(cause instanceof Error ? cause.message : "활동 로그를 불러오지 못했습니다.");
      } finally {
        if (!controller.signal.aborted && currentVersion === version.current) setLoading(false);
      }
    };
    const timer = window.setTimeout(() => void load(), 0);
    return () => { window.clearTimeout(timer); request.current?.abort(); };
  }, [filters, refresh]);

  const loadMore = async () => {
    if (!cursor || loading || morePending.current) return;
    morePending.current = true;
    setLoadingMore(true); setError(null);
    const currentVersion = version.current;
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await apiFetch(`/api/space-management/logs?${logParams(filters, cursor)}`, { signal: controller.signal }, { showGlobalError: false, retries: 0 });
      if (!response.ok) throw new Error(await responseError(response, "다음 로그를 불러오지 못했습니다."));
      const payload = await response.json();
      if (controller.signal.aborted || currentVersion !== version.current) return;
      setLogs((current) => {
        const seen = new Set(current.map((log) => log.id));
        return [...current, ...(Array.isArray(payload.items) ? payload.items : []).filter((log: ActivitySummary) => !seen.has(log.id))];
      });
      setCursor(typeof payload.nextCursor === "string" ? payload.nextCursor : null);
    } catch (cause) {
      if (!controller.signal.aborted && currentVersion === version.current) setError(cause instanceof Error ? cause.message : "다음 로그를 불러오지 못했습니다.");
    } finally {
      if (!controller.signal.aborted && currentVersion === version.current) { morePending.current = false; setLoadingMore(false); }
    }
  };

  const submit = (event: FormEvent) => { event.preventDefault(); setFilters({ ...draft }); };
  const reset = () => { setDraft(emptyFilters); setFilters({ ...emptyFilters }); };
  const range = (days: number | null) => {
    const next = { ...draft, ...(days ? activityDateRange(days) : { from: "", to: "" }) };
    setDraft(next); setFilters(next);
  };
  const hasFilters = Object.entries(filters).some(([key, value]) => key !== "order" && value);
  const pendingFilters = JSON.stringify(draft) !== JSON.stringify(filters);

  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
      <div><h2 className="text-base font-bold text-slate-900">활동 로그</h2><p className="mt-1 text-xs text-slate-500">작업 이력을 찾고 변경 전후 내용을 확인하세요.</p></div>
      <button type="button" onClick={() => setRefresh((value) => value + 1)} disabled={loading || loadingMore} className={`${buttonClass} flex items-center gap-2`}><RefreshCw size={14} />새로고침</button>
    </div>
    <form onSubmit={submit} className="space-y-3 border-b border-slate-200 bg-slate-50/60 p-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <label className="space-y-1 text-xs font-medium text-slate-600"><span>통합 검색</span><div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-3 text-slate-400" /><input value={draft.query} onChange={(event) => setDraft({ ...draft, query: event.target.value })} maxLength={100} placeholder="항목, 사업, 실행자, 대상 ID" className={`${inputClass} pl-9`} /></div></label>
        <label className="space-y-1 text-xs font-medium text-slate-600"><span>유형</span><select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })} className={inputClass}><option value="">전체 유형</option>{activityTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
        <label className="space-y-1 text-xs font-medium text-slate-600"><span>동작</span><select value={draft.action} onChange={(event) => setDraft({ ...draft, action: event.target.value })} className={inputClass}><option value="">전체 동작</option>{activityActions.map((action) => <option key={action}>{action}</option>)}</select></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-xs font-medium text-slate-600"><span>실행자</span><input value={draft.actor} onChange={(event) => setDraft({ ...draft, actor: event.target.value })} maxLength={100} placeholder="이름 또는 이메일" className={inputClass} /></label>
        <label className="space-y-1 text-xs font-medium text-slate-600"><span>사업</span><input value={draft.project} onChange={(event) => setDraft({ ...draft, project: event.target.value })} maxLength={100} placeholder="사업 이름" className={inputClass} /></label>
        <label className="space-y-1 text-xs font-medium text-slate-600"><span>시작일</span><input type="date" value={draft.from} max={draft.to || undefined} onChange={(event) => setDraft({ ...draft, from: event.target.value })} className={inputClass} /></label>
        <label className="space-y-1 text-xs font-medium text-slate-600"><span>종료일</span><input type="date" value={draft.to} min={draft.from || undefined} onChange={(event) => setDraft({ ...draft, to: event.target.value })} className={inputClass} /></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-xs text-slate-500">빠른 기간</span>{([[1, "오늘"], [7, "최근 7일"], [30, "최근 30일"], [null, "전체 기간"]] as const).map(([days, label]) => <button key={label} type="button" onClick={() => range(days)} className={buttonClass}>{label}</button>)}<span className="text-[11px] text-slate-400">한국 시간 기준</span></div>
        <div className="flex items-center gap-2"><button type="button" onClick={reset} className={buttonClass}>초기화</button><button type="submit" className="min-h-10 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500">조회</button></div>
      </div>
      {pendingFilters && <p className="text-xs text-indigo-600">조건을 바꿨습니다. 조회를 누르면 적용됩니다.</p>}
    </form>
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <p role="status" aria-live="polite" className="text-xs text-slate-500">{loading ? "조회 중..." : `${logs.length}건 표시${cursor ? " · 더 많은 기록이 있습니다" : ""}`}{hasFilters && !loading && <span className="ml-2 rounded bg-indigo-50 px-2 py-0.5 text-indigo-600">검색 조건 적용 중</span>}</p>
      <label className="flex items-center gap-2 text-xs text-slate-500">정렬<select value={filters.order} onChange={(event) => { const order = event.target.value; setDraft({ ...draft, order }); setFilters({ ...filters, order }); }} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"><option value="desc">최신순</option><option value="asc">오래된순</option></select></label>
    </div>
    {error && <div role="alert" className="mx-4 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><span>{error}</span><button type="button" onClick={() => cursor ? void loadMore() : setRefresh((value) => value + 1)} className="font-semibold underline">다시 시도</button></div>}
    <div aria-busy={loading || loadingMore}>
      {loading ? <p className="px-4 py-14 text-center text-sm text-slate-400">활동 로그를 불러오는 중...</p> : !logs.length && !error ? <div className="px-4 py-14 text-center"><p className="text-sm font-semibold text-slate-600">{hasFilters ? "조건에 맞는 기록이 없습니다." : "아직 활동 기록이 없습니다."}</p>{hasFilters && <button type="button" onClick={reset} className="mt-3 text-xs font-semibold text-indigo-600">조건을 초기화하고 전체 기록 보기</button>}</div> : <>
        <div className="hidden grid-cols-[10rem_minmax(0,1fr)_9rem_9rem_2rem] gap-3 border-y border-slate-100 bg-slate-50 px-4 py-2 text-[11px] font-semibold text-slate-400 lg:grid"><span>기록 시간</span><span>유형 · 동작 / 항목</span><span>사업</span><span>실행자</span><span className="sr-only">상세</span></div>
        <div className="divide-y divide-slate-100">{logs.map((log) => <button key={log.id} type="button" onClick={() => setSelected(log)} className="grid w-full grid-cols-[minmax(0,1fr)_1rem] items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-indigo-50/40 focus-visible:outline-2 focus-visible:outline-indigo-500 lg:grid-cols-[10rem_minmax(0,1fr)_9rem_9rem_2rem] lg:gap-3" aria-label={`${log.title}, ${log.action}, ${actorName(log)}, 상세 보기`}>
          <time dateTime={log.timestamp} className="col-span-2 text-[11px] tabular-nums text-slate-500 lg:col-span-1">{activityTime(log.timestamp)}</time>
          <div className="min-w-0"><div className="mb-1 flex flex-wrap items-center gap-1.5"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{log.type}</span><span className={`text-[11px] font-medium ${log.action.includes("삭제") || log.action === "제거" || log.action === "가입 반려" ? "text-rose-600" : "text-indigo-600"}`}>{log.action}</span></div><p className="truncate text-sm font-semibold text-slate-800" title={log.title}>{log.title}</p><p className="mt-1 truncate text-xs text-slate-500 lg:hidden">{projectName(log)} · {actorName(log)}</p></div>
          <span className="hidden truncate text-xs text-slate-600 lg:block" title={projectName(log)}>{projectName(log)}</span><span className="hidden truncate text-xs text-slate-600 lg:block" title={log.actor.email}>{actorName(log)}</span><ChevronRight size={15} className="text-slate-400" />
        </button>)}</div>
      </>}
    </div>
    {!loading && cursor && <div className="border-t border-slate-100 p-3 text-center"><button type="button" onClick={() => void loadMore()} disabled={loadingMore} className={buttonClass}>{loadingMore ? "불러오는 중..." : "다음 기록 더 보기"}</button></div>}
    {selected && <ActivityLogDetail key={selected.id} log={selected} onClose={() => setSelected(null)} />}
  </section>;
}

function ActivityLogDetail({ log, onClose }: { log: ActivitySummary; onClose: () => void }) {
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [retry, setRetry] = useState(0);
  const [copyNotice, setCopyNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setError(null);
      try {
        const response = await apiFetch(`/api/space-management/logs/${encodeURIComponent(log.id)}`, { signal: controller.signal }, { showGlobalError: false, retries: 0 });
        if (!response.ok) throw new Error(await responseError(response, "로그 상세 내용을 불러오지 못했습니다."));
        const payload = await response.json();
        if (!controller.signal.aborted) setDetail(payload);
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "로그 상세 내용을 불러오지 못했습니다."); }
    };
    void load();
    return () => controller.abort();
  }, [log.id, retry]);
  const rows = detail ? activityChanges(detail) : [];
  const visibleRows = showAll ? rows : rows.filter((row) => row.changed);
  const metadata = detail ? Object.entries(activityData(detail.metadata)) : [];
  const copyId = async () => {
    try { await navigator.clipboard.writeText(log.entityId); setCopyNotice("대상 ID를 복사했습니다."); }
    catch { setCopyNotice("복사하지 못했습니다. 아래 ID를 선택해 복사해주세요."); }
  };

  return <ModalFrame title="활동 로그 상세" onClose={onClose} className="max-w-4xl">
    <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><h2 className="text-base font-bold text-slate-900">활동 로그 상세</h2><ModalCloseButton label="로그 상세 닫기" onClick={onClose} /></div>
    <div className="space-y-5 p-5">
      <div><p className="text-xs font-semibold text-indigo-600">{log.type} · {log.action}</p><h3 className="mt-1 break-words text-lg font-bold text-slate-900">{log.title}</h3><p className="mt-2 text-xs text-slate-500">{activityTime(log.timestamp)} · {projectName(log)}</p><p className="mt-1 break-words text-xs text-slate-600">실행자 {actorName(log)} · {log.actor.email}</p></div>
      {error ? <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}<button type="button" onClick={() => setRetry((value) => value + 1)} className="ml-3 font-semibold underline">다시 시도</button></div> : !detail ? <p role="status" className="py-8 text-center text-sm text-slate-400">변경 내용을 불러오는 중...</p> : <>
        <section><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-bold text-slate-800">변경 내용 <span className="ml-1 text-xs font-normal text-slate-400">{rows.filter((row) => row.changed).length}개 필드</span></h4>{rows.length > 0 && <label className="flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} className="accent-indigo-600" />전체 필드 보기</label>}</div>
          {visibleRows.length ? <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[32rem] table-fixed text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="w-28 px-3 py-2 font-medium">항목</th><th className="px-3 py-2 font-medium">변경 전</th><th className="px-3 py-2 font-medium">변경 후</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.key} className="border-t border-slate-100"><th scope="row" className="px-3 py-3 align-top font-medium text-slate-600">{activityFieldLabel(row.key)}</th><td className={`px-3 py-3 align-top ${row.changed ? "bg-rose-50/50" : ""}`}><div className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-slate-600">{activityValue(row.key, row.before)}</div></td><td className={`px-3 py-3 align-top ${row.changed ? "bg-emerald-50/50" : ""}`}><div className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-slate-800">{activityValue(row.key, row.after)}</div></td></tr>)}</tbody></table></div> : <p className="rounded-lg bg-slate-50 p-4 text-xs text-slate-500">{rows.length ? "변경된 값이 없습니다. 전체 필드 보기로 저장된 값을 확인할 수 있습니다." : "이 기록에는 변경 전후 값이 저장되어 있지 않습니다."}</p>}
        </section>
        {metadata.length > 0 && <section><h4 className="mb-2 text-sm font-bold text-slate-800">추가 정보</h4><dl className="space-y-2 rounded-lg bg-slate-50 p-3 text-xs">{metadata.map(([key, value]) => <div key={key} className="grid gap-1 sm:grid-cols-[10rem_minmax(0,1fr)]"><dt className="text-slate-500">{activityFieldLabel(key)}</dt><dd className="whitespace-pre-wrap break-words text-slate-700">{activityValue(key, value)}</dd></div>)}</dl></section>}
      </>}
      <details className="rounded-lg border border-slate-200 p-3 text-xs"><summary className="cursor-pointer font-semibold text-slate-600">기록 식별 정보</summary><dl className="mt-3 space-y-2 text-slate-500"><div><dt>로그 ID</dt><dd className="select-all break-all font-mono text-slate-700">{log.id}</dd></div><div><dt>대상 유형</dt><dd className="text-slate-700">{log.entityType}</dd></div><div><dt>대상 ID</dt><dd className="select-all break-all font-mono text-slate-700">{log.entityId}</dd></div></dl><button type="button" onClick={() => void copyId()} className="mt-3 font-semibold text-indigo-600">대상 ID 복사</button><p role="status" className="mt-1 text-slate-500">{copyNotice}</p></details>
    </div>
  </ModalFrame>;
}
