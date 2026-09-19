"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import { BookOpen, CalendarDays, Globe, Lock } from "lucide-react";
import { apiFetch } from "@/lib/client-fetch";
import { Skeleton } from "@/components/ui/Skeleton";

interface Meeting {
  id: string;
  title: string;
  visibility: "PRIVATE" | "INTERNAL" | "EXTERNAL";
  updatedAt: string;
  author: { name: string | null };
  project: { id: string; name: string; color: string };
}

function VisibilityBadge({ visibility }: { visibility: Meeting["visibility"] }) {
  if (visibility === "EXTERNAL") {
    return <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"><Globe size={10} />외부</span>;
  }
  if (visibility === "INTERNAL") {
    return <span className="flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700"><Globe size={10} />내부</span>;
  }
  return <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500"><Lock size={10} />비공개</span>;
}

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiFetch("/api/meetings");
        if (!response.ok) throw new Error("Meetings request failed");
        const data = await response.json();
        if (!cancelled) setMeetings(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setError("회의록을 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  return (
    <div className="h-full flex flex-col">
      <header className="border-b border-gray-100 bg-white px-4 py-4 md:px-8 md:py-6">
        <p className="mb-1 text-xs text-gray-400">전체 사업</p>
        <h1 className="text-xl font-bold text-gray-900">회의록</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6">
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, index) => <Skeleton key={index} className="h-20 w-full rounded-xl" />)}
          </div>
        ) : error ? (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <p className="font-medium text-rose-700">{error}</p>
            <button type="button" onClick={() => setReloadKey((current) => current + 1)} className="mt-3 font-medium text-rose-700 underline hover:text-rose-900">다시 시도</button>
          </div>
        ) : meetings.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50"><CalendarDays size={28} className="text-indigo-400" /></div>
            <p className="font-medium text-gray-700">아직 회의록이 없습니다</p>
            <p className="mt-1 text-sm text-gray-400">아카이브 문서를 회의록으로 분류하면 이곳에 모입니다.</p>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">
            {meetings.map((meeting) => (
              <Link key={meeting.id} href={`/dashboard/projects/${meeting.project.id}/archive/${meeting.id}`} className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-gray-50 md:px-5">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${meeting.project.color}18`, color: meeting.project.color }}><BookOpen size={17} /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{meeting.title}</p>
                  <p className="mt-1 truncate text-xs text-gray-400"><span className="font-medium text-gray-600">{meeting.project.name}</span> · {meeting.author.name ?? "작성자 없음"} · {dayjs(meeting.updatedAt).format("YYYY.MM.DD")}</p>
                </div>
                <VisibilityBadge visibility={meeting.visibility} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}