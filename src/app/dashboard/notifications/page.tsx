"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Check, CheckCheck, RefreshCw, Settings2 } from "lucide-react";
import dayjs from "dayjs";
import { apiFetch, getModalExceptionMessage, getModalRequestErrorMessage, showToast } from "@/lib/client-fetch";
import ModalFrame, { ModalCloseButton } from "@/components/ui/ModalFrame";

type NotificationItem = { id: string; type: string; title: string; body: string; href: string; readAt: string | null; createdAt: string };
type PreferenceKey = "mentionNotifications" | "assignmentNotifications" | "dueDateNotifications" | "meetingNotifications" | "approvalNotifications";
const preferenceItems: Array<{ key: PreferenceKey; title: string; description: string }> = [
  { key: "mentionNotifications", title: "카드 댓글 멘션", description: "구성원이 댓글에서 나를 멘션하면 알립니다." },
  { key: "assignmentNotifications", title: "업무 배정", description: "카드 담당자로 지정되면 알립니다." },
  { key: "dueDateNotifications", title: "마감일", description: "담당 업무의 마감 임박 및 지연을 알립니다." },
  { key: "meetingNotifications", title: "회의록 공유", description: "사업 회의록이 공유되면 알립니다." },
  { key: "approvalNotifications", title: "가입 승인", description: "가입 신청 결과를 알립니다." },
];

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [preferences, setPreferences] = useState<Record<PreferenceKey, boolean>>({ mentionNotifications: true, assignmentNotifications: true, dueDateNotifications: true, meetingNotifications: true, approvalNotifications: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsNotice, setSettingsNotice] = useState("");
  const unreadOnlyRef = useRef(false);
  const loadSequence = useRef(0);
  const listPending = useRef(false);
  const readVersion = useRef(0);
  const preferenceVersion = useRef(0);
  const preferencePending = useRef(false);
  const readOverrides = useRef(new Map<string, string>());
  const allReadBefore = useRef<string | null>(null);
  const failedAppend = useRef(false);
  const pendingReadIds = useRef(new Set<string>());
  const allReadPending = useRef(false);

  const load = useCallback(async (cursor?: string, append = false) => {
    if (append && listPending.current) return;
    const requestId = ++loadSequence.current;
    const currentReadVersion = readVersion.current;
    const currentPreferenceVersion = preferenceVersion.current;
    const filter = unreadOnlyRef.current;
    listPending.current = true;
    failedAppend.current = append;
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch(`/api/notifications?limit=30&unreadOnly=${filter}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, undefined, { showGlobalError: false });
      if (!response.ok) throw new Error(await getModalRequestErrorMessage(response, "알림 조회"));
      const data = await response.json();
      if (requestId !== loadSequence.current) return;
      const incoming: NotificationItem[] = (Array.isArray(data.items) ? data.items : []).map((item: NotificationItem) => ({
        ...item,
        readAt: item.readAt ?? readOverrides.current.get(item.id) ?? (allReadBefore.current && item.createdAt <= allReadBefore.current ? allReadBefore.current : null),
      })).filter((item: NotificationItem) => !filter || !item.readAt);
      setItems((current) => {
        const merged = append ? [...current, ...incoming] : incoming;
        return [...new Map(merged.map((item) => [item.id, item])).values()];
      });
      setNextCursor(data.nextCursor ?? null);
      failedAppend.current = false;
      if (currentReadVersion === readVersion.current && pendingReadIds.current.size === 0 && !allReadPending.current) setUnreadCount(data.unreadCount ?? 0);
      if (!append && currentPreferenceVersion === preferenceVersion.current && !preferencePending.current) {
        setPreferences((current) => Object.fromEntries(preferenceItems.map(({ key }) => [key, data.preferences?.[key] ?? current[key]])) as Record<PreferenceKey, boolean>);
        setPreferencesLoaded(true);
      }
    } catch (cause) {
      if (requestId === loadSequence.current) setError(getModalExceptionMessage(cause, "알림 조회"));
    } finally {
      if (requestId === loadSequence.current) { listPending.current = false; setLoading(false); }
    }
  }, []);

  const syncUnreadCount = async () => {
    const version = readVersion.current;
    if (typeof window !== "undefined") window.dispatchEvent(new Event("notifications:changed"));
    try {
      const response = await apiFetch("/api/notifications?limit=1", undefined, { showGlobalError: false, retries: 0 });
      if (!response.ok) return;
      const data = await response.json();
      if (version === readVersion.current && !allReadPending.current && pendingReadIds.current.size === 0) setUnreadCount(data.unreadCount ?? 0);
    } catch { /* A later refresh reconciles the count without undoing a successful read. */ }
  };

  const changeFilter = (unread: boolean) => {
    if (unreadOnlyRef.current === unread) return;
    unreadOnlyRef.current = unread;
    setUnreadOnly(unread);
    setItems([]); setNextCursor(null);
    void load();
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const savePreference = async (key: PreferenceKey, checked: boolean) => {
    if (preferencePending.current || !preferencesLoaded) return;
    preferencePending.current = true;
    setSaving(true); setSettingsError(""); setSettingsNotice("");
    try {
      const response = await apiFetch("/api/notifications/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: checked }) }, { showGlobalError: false });
      if (!response.ok) { setSettingsError(await getModalRequestErrorMessage(response, "알림 설정 저장")); return; }
      const data = await response.json();
      preferenceVersion.current++;
      setPreferences((current) => ({ ...current, [key]: typeof data[key] === "boolean" ? data[key] : checked }));
      setSettingsNotice("알림 설정을 저장했습니다.");
    } catch (cause) { setSettingsError(getModalExceptionMessage(cause, "알림 설정 저장")); }
    finally { preferencePending.current = false; setSaving(false); }
  };

  const markRead = async (notification: NotificationItem) => {
    if (notification.readAt || readOverrides.current.has(notification.id) || allReadPending.current || pendingReadIds.current.has(notification.id)) return;
    pendingReadIds.current.add(notification.id);
    setReading(true);
    setError("");
    try {
      const response = await apiFetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notificationId: notification.id }) }, { showGlobalError: false });
      if (!response.ok) {
        const message = await getModalRequestErrorMessage(response, "알림 읽음 처리");
        setError(message);
        showToast(message);
        return;
      }
      const data = await response.json();
      const readAt = typeof data.readAt === "string" ? data.readAt : new Date().toISOString();
      readOverrides.current.set(notification.id, readAt);
      readVersion.current++;
      setItems((current) => current.map((item) => item.id === notification.id ? { ...item, readAt } : item).filter((item) => !unreadOnlyRef.current || !item.readAt));
      if (data.updatedCount !== 0) setUnreadCount((current) => Math.max(0, current - 1));
    } catch (cause) {
      const message = getModalExceptionMessage(cause, "알림 읽음 처리");
      setError(message);
      showToast(message);
    } finally {
      pendingReadIds.current.delete(notification.id);
      setReading(pendingReadIds.current.size > 0 || allReadPending.current);
      if (!pendingReadIds.current.size && !allReadPending.current) void syncUnreadCount();
    }
  };

  const markAllRead = async () => {
    if (loading || allReadPending.current || pendingReadIds.current.size > 0) return;
    allReadPending.current = true;
    setReading(true);
    setError("");
    try {
      const response = await apiFetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markAllRead: true }) }, { showGlobalError: false });
      if (!response.ok) {
        setError(await getModalRequestErrorMessage(response, "알림 읽음 처리"));
        return;
      }
      const data = await response.json();
      const readAt = typeof data.readAt === "string" ? data.readAt : new Date().toISOString();
      allReadBefore.current = readAt;
      readVersion.current++;
      setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? (item.createdAt <= readAt ? readAt : null) })).filter((item) => !unreadOnlyRef.current || !item.readAt));
      setUnreadCount((current) => typeof data.updatedCount === "number" ? Math.max(0, current - data.updatedCount) : 0);
    } catch (cause) {
      setError(getModalExceptionMessage(cause, "알림 읽음 처리"));
    } finally {
      allReadPending.current = false;
      setReading(false);
      void syncUnreadCount();
    }
  };

  const typeLabel = (type: string) => ({ TASK_MENTION: "댓글 멘션", MENTION: "댓글 멘션", ASSIGNMENT: "업무 배정", DUE_DATE: "마감일", MEETING: "회의록", APPROVAL: "가입 승인" }[type] ?? "알림");
  return <main className="min-h-full bg-gray-50 px-4 py-6 md:px-8">
    <div className="mx-auto max-w-3xl">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs text-gray-400">내 활동</p><h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-gray-900"><Bell size={21} className="text-indigo-600" />알림함</h1><p role="status" className="mt-2 text-xs text-gray-500">{preferencesLoaded ? `읽지 않은 알림 ${unreadCount}개` : "알림을 확인하고 있습니다."}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={loading || reading} onClick={() => void load()} aria-label="알림 새로고침" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"><RefreshCw size={15} /><span className="hidden sm:inline">새로고침</span></button>
          <button type="button" onClick={() => setSettingsOpen(true)} aria-label="알림 설정" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"><Settings2 size={15} /><span className="hidden sm:inline">알림 설정</span></button>
          {unreadCount > 0 && <button type="button" disabled={reading || loading} onClick={() => void markAllRead()} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"><CheckCheck size={15} />모두 읽음</button>}
        </div>
      </header>
      {error && <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"><span>{error}</span><button type="button" disabled={loading || reading} onClick={() => void load(failedAppend.current ? nextCursor ?? undefined : undefined, failedAppend.current)} className="font-semibold underline disabled:opacity-50">다시 시도</button></div>}
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white" aria-busy={loading}>
        <div className="flex gap-1 border-b border-gray-100 p-2" aria-label="알림 필터">{[[false, "전체"], [true, "읽지 않음"]].map(([unread, label]) => <button key={String(label)} type="button" aria-pressed={unreadOnly === unread} onClick={() => changeFilter(unread as boolean)} className={`min-h-10 rounded-lg px-4 py-2 text-sm font-semibold ${unreadOnly === unread ? "bg-indigo-50 text-indigo-700" : "text-gray-500 hover:bg-gray-50"}`}>{label}</button>)}</div>
        {loading && items.length === 0 ? <p className="px-4 py-12 text-center text-sm text-gray-400">알림을 불러오는 중...</p> : items.length === 0 && !error ? <div className="px-4 py-14 text-center"><Bell size={24} className="mx-auto mb-3 text-gray-300" /><p className="text-sm font-medium text-gray-600">{unreadOnly ? "읽지 않은 알림이 없습니다" : "아직 받은 알림이 없습니다"}</p><p className="mt-1 text-xs text-gray-400">{unreadOnly ? "전체 탭에서 이전 알림을 확인할 수 있습니다." : "멘션, 업무 배정, 마감일 등 업무 알림이 이곳에 표시됩니다."}</p></div> : <div className="divide-y divide-gray-100">{items.map((item) => <article key={item.id} className="flex items-center gap-1 pr-3">
          <Link href={item.href} onClick={() => void markRead(item)} className={`min-w-0 flex-1 px-4 py-4 transition-colors hover:bg-gray-50 ${item.readAt ? "" : "bg-indigo-50/50"}`}>
            <span className="flex gap-3"><span aria-label={item.readAt ? "읽은 알림" : "읽지 않은 알림"} className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.readAt ? "bg-transparent" : "bg-indigo-600"}`} /><span className="min-w-0 flex-1"><span className="mb-1 flex flex-wrap items-center justify-between gap-2"><span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">{typeLabel(item.type)}</span><time dateTime={item.createdAt} className="text-[11px] text-gray-400">{dayjs(item.createdAt).format("YYYY.MM.DD HH:mm")}</time></span><span className="block break-words text-sm font-semibold text-gray-900">{item.title}</span><span className="mt-1 block break-words text-sm text-gray-600">{item.body}</span></span></span>
          </Link>
          {!item.readAt && <button type="button" disabled={reading} onClick={() => void markRead(item)} aria-label={`${item.title} 읽음 처리`} title="이동하지 않고 읽음 처리" className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"><Check size={15} /><span className="hidden sm:inline">읽음</span></button>}
        </article>)}</div>}
        {nextCursor && <div className="border-t border-gray-100 p-3 text-center"><button type="button" disabled={loading || reading} onClick={() => void load(nextCursor, true)} className="rounded-lg px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">{loading ? "불러오는 중..." : "더 보기"}</button></div>}
      </section>
    </div>
    {settingsOpen && <ModalFrame title="알림 설정" onClose={() => setSettingsOpen(false)} className="max-w-lg p-5 sm:p-6">
      <header className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-gray-900">알림 설정</h2><p className="mt-1 text-xs text-gray-500">받을 알림 유형을 선택하세요. 변경하면 바로 저장됩니다.</p></div><ModalCloseButton label="알림 설정 닫기" onClick={() => setSettingsOpen(false)} /></header>
      {!preferencesLoaded && <p className="mb-3 text-xs text-amber-700">설정을 불러온 뒤 변경할 수 있습니다. 알림함을 새로고침해주세요.</p>}
      {settingsError && <p role="alert" className="mb-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{settingsError}</p>}
      <div className="divide-y divide-gray-100">{preferenceItems.map(({ key, title, description }) => <label key={key} className="flex cursor-pointer items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"><span><span className="block text-sm text-gray-700">{title}</span><span className="mt-0.5 block text-xs text-gray-400">{description}</span></span><input type="checkbox" checked={preferences[key]} disabled={saving || !preferencesLoaded} onChange={(event) => void savePreference(key, event.target.checked)} className="h-4 w-4 accent-indigo-600" /></label>)}</div>
      <p role="status" className="mt-3 text-xs text-gray-500">{saving ? "저장 중..." : settingsNotice}</p>
    </ModalFrame>}
  </main>;
}
