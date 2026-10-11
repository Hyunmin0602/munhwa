"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Settings2 } from "lucide-react";
import dayjs from "dayjs";
import { apiFetch } from "@/lib/client-fetch";
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

  const load = useCallback(async (cursor?: string, append = false) => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch(`/api/notifications?limit=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, undefined, { showGlobalError: false });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message ?? "알림을 불러오지 못했습니다.");
      setItems((current) => append ? [...current, ...(data.items ?? [])] : data.items ?? []);
      setNextCursor(data.nextCursor ?? null);
      setUnreadCount(data.unreadCount ?? 0);
      setPreferences((current) => Object.fromEntries(preferenceItems.map(({ key }) => [key, data.preferences?.[key] ?? current[key]])) as Record<PreferenceKey, boolean>);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "알림을 불러오지 못했습니다.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const savePreference = async (key: PreferenceKey, checked: boolean) => {
    const previous = preferences[key];
    setPreferences((current) => ({ ...current, [key]: checked }));
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch("/api/notifications/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: checked }) }, { showGlobalError: false });
      if (!response.ok) throw new Error("알림 설정을 저장하지 못했습니다.");
    } catch (cause) {
      setPreferences((current) => ({ ...current, [key]: previous }));
      setError(cause instanceof Error ? cause.message : "알림 설정을 저장하지 못했습니다.");
    } finally { setSaving(false); }
  };

  const markRead = async (notification: NotificationItem) => {
    if (notification.readAt) return;
    setItems((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item));
    setUnreadCount((current) => Math.max(0, current - 1));
    void apiFetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notificationId: notification.id }) }, { showGlobalError: false });
  };

  const markAllRead = async () => {
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
    setUnreadCount(0);
    const response = await apiFetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markAllRead: true }) }, { showGlobalError: false });
    if (!response.ok) void load();
  };

  return <main className="min-h-full bg-gray-50 px-4 py-6 md:px-8">
    <div className="mx-auto max-w-3xl">
      <header className="mb-5 flex items-center justify-between gap-3"><div><p className="text-xs text-gray-400">내 활동</p><h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-gray-900"><Bell size={21} className="text-indigo-600" />알림함</h1></div><div className="flex items-center gap-2"><button type="button" onClick={() => setSettingsOpen(true)} aria-label="알림 설정" className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"><Settings2 size={15} /><span className="hidden sm:inline">알림 설정</span></button>{unreadCount > 0 && <button type="button" onClick={() => void markAllRead()} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"><CheckCheck size={15} />모두 읽음</button>}</div></header>
      {error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {loading && items.length === 0 ? <p className="px-4 py-12 text-center text-sm text-gray-400">알림을 불러오는 중...</p> : items.length === 0 ? <div className="px-4 py-14 text-center"><Bell size={24} className="mx-auto mb-3 text-gray-300" /><p className="text-sm font-medium text-gray-600">새 알림이 없습니다</p><p className="mt-1 text-xs text-gray-400">멘션 알림이 이곳에 표시됩니다.</p></div> : <div className="divide-y divide-gray-100">{items.map((item) => <Link key={item.id} href={item.href} onClick={() => void markRead(item)} className={`block px-4 py-4 transition-colors hover:bg-gray-50 ${item.readAt ? "" : "bg-indigo-50/50"}`}><div className="flex gap-3"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.readAt ? "bg-transparent" : "bg-indigo-600"}`} /><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold text-gray-900">{item.title}</span><time className="text-[11px] text-gray-400">{dayjs(item.createdAt).format("YYYY.MM.DD HH:mm")}</time></span><span className="mt-1 block text-sm text-gray-600">{item.body}</span></span></div></Link>)}</div>}
        {nextCursor && <div className="border-t border-gray-100 p-3 text-center"><button type="button" disabled={loading} onClick={() => void load(nextCursor, true)} className="rounded-lg px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">더 보기</button></div>}
      </section>
    </div>
    {settingsOpen && <ModalFrame title="알림 설정" onClose={() => setSettingsOpen(false)} className="max-w-lg p-5 sm:p-6">
      <header className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-gray-900">알림 설정</h2><p className="mt-1 text-xs text-gray-500">받을 알림 유형을 선택하세요.</p></div><ModalCloseButton label="알림 설정 닫기" onClick={() => setSettingsOpen(false)} /></header>
      <div className="divide-y divide-gray-100">{preferenceItems.map(({ key, title, description }) => <label key={key} className="flex cursor-pointer items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"><span><span className="block text-sm text-gray-700">{title}</span><span className="mt-0.5 block text-xs text-gray-400">{description}</span></span><input type="checkbox" checked={preferences[key]} disabled={saving} onChange={(event) => void savePreference(key, event.target.checked)} className="h-4 w-4 accent-indigo-600" /></label>)}</div>
    </ModalFrame>}
  </main>;
}
