"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import dayjs from "dayjs";
import "dayjs/locale/ko";
import { Skeleton } from "./ui/Skeleton";
import { apiFetch, showToast, showUndoToast } from "@/lib/client-fetch";

dayjs.locale("ko");

interface Post {
  id: string;
  title: string;
  content?: string | null;
  slug: string;
  visibility: "PRIVATE" | "INTERNAL" | "EXTERNAL";
  published?: boolean;
  updatedAt: string;
  author: { name: string | null };
}

export default function ArchiveList({ projectId }: { projectId: string }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadingPage, setLoadingPage] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [currentCursor, setCurrentCursor] = useState<string | null>(null);
  const router = useRouter();
  const previousProjectId = useRef(projectId);

  useEffect(() => {
    if (previousProjectId.current !== projectId) {
      previousProjectId.current = projectId;
      setPosts([]);
      setCurrentCursor(null);
      setCursorHistory([]);
      setNextCursor(null);
      setReloadKey((current) => current + 1);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const query = new URLSearchParams({ limit: "10" });
        if (currentCursor) query.set("cursor", currentCursor);
        const res = await apiFetch(`/api/projects/${projectId}/archive?${query.toString()}`);
        if (!res.ok) throw new Error("Archive list request failed");
        const data = await res.json();
        setPosts(Array.isArray(data?.items) ? data.items : []);
        setNextCursor(typeof data?.nextCursor === "string" ? data.nextCursor : null);
        setError(null);
      } catch {
        if (!cancelled) setError("문서를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, reloadKey, currentCursor]);

  const goNextPage = () => {
    if (!nextCursor || loadingPage) return;
    setLoadingPage(true);
    setError(null);
    setCursorHistory((current) => [...current, currentCursor ?? ""]);
    setCurrentCursor(nextCursor);
    setLoadingPage(false);
  };

  const goPreviousPage = () => {
    if (!cursorHistory.length || loadingPage) return;
    setLoadingPage(true);
    setError(null);
    setCursorHistory((current) => {
      const nextHistory = [...current];
      const previousCursor = nextHistory.pop() ?? "";
      setCurrentCursor(previousCursor || null);
      return nextHistory;
    });
    setLoadingPage(false);
  };

  const createPost = async () => {
    setCreating(true);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "제목 없음" }),
      });
      if (res.ok) {
        const post = await res.json();
        router.push(`/dashboard/projects/${projectId}/archive/${post.id}`);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "문서를 만들지 못했습니다.");
      }
    } catch {
      setError("문서를 만들지 못했습니다. 다시 시도해주세요.");
    } finally {
      setCreating(false);
    }
  };

  const deletePost = async (id: string, commitImmediately = false) => {
    const post = posts.find((item) => item.id === id);
    if (!post || !confirm(`'${post.title}' 문서를 삭제하시겠습니까?${commitImmediately ? " 삭제 후 복구할 수 없습니다." : " 실행취소 버튼이 사라진 후엔 문서를 복구할 수 없습니다."}`)) return;
    const index = posts.findIndex((item) => item.id === id);

    if (commitImmediately) {
      try {
        const res = await apiFetch(`/api/projects/${projectId}/archive/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Archive delete request failed");
        setPosts((prev) => prev.filter((item) => item.id !== id));
      } catch {
        showToast("문서를 삭제하지 못했습니다. 다시 시도해주세요.");
      }
      return;
    }

    setPosts((prev) => prev.filter((item) => item.id !== id));
    showUndoToast(
      `'${post.title}' 문서를 삭제했습니다.`,
      async () => {
        try {
          const res = await apiFetch(`/api/projects/${projectId}/archive/${id}`, { method: "DELETE" });
          if (!res.ok) throw new Error("Archive delete request failed");
        } catch {
          setPosts((prev) => prev.some((item) => item.id === id) ? prev : [...prev.slice(0, index), post, ...prev.slice(index)]);
          showToast("문서를 삭제하지 못했습니다. 다시 시도해주세요.");
        }
      },
      () => setPosts((prev) => prev.some((item) => item.id === id) ? prev : [...prev.slice(0, index), post, ...prev.slice(index)])
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="mb-4 flex flex-shrink-0 items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          문서 <span className="font-semibold text-gray-800">{posts.length}개</span>
        </p>
        <button
          onClick={createPost}
          disabled={creating}
          className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-indigo-500 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:translate-y-0"
        >
          <Plus size={14} />
          {creating ? "생성 중..." : "새 문서"}
        </button>
      </div>

      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm font-medium text-rose-600">{error}</p>
          <button type="button" onClick={() => setReloadKey((current) => current + 1)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">다시 시도</button>
        </div>
      ) : loading ? (
        <>
          <Skeleton className="mb-4 h-4 w-24 rounded" />
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="hidden grid-cols-[minmax(0,1fr)_7rem_7rem_7rem_2.5rem] gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2 text-[11px] font-semibold text-gray-400 md:grid">
              <span>문서</span><span>작성자</span><span>공개 범위</span><span>수정일</span><span aria-hidden="true" />
            </div>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="relative border-b border-gray-100 last:border-b-0">
                <div className="grid grid-cols-2 gap-1.5 px-3 py-3 pr-14 md:grid-cols-[minmax(0,1fr)_7rem_7rem_7rem_2.5rem] md:items-center md:gap-3 md:px-4 md:pr-4">
                  <div className="col-span-2 min-w-0 md:col-span-1">
                    <Skeleton className="h-4 w-2/3 rounded" />
                    <Skeleton className="mt-1 h-3 w-1/3 rounded" />
                  </div>
                  <Skeleton className="h-3 w-3/4 rounded md:w-20" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <Skeleton className="h-3 w-20 rounded" />
                  <span aria-hidden="true" />
                </div>
                <Skeleton className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-lg md:right-1" />
              </div>
            ))}
          </div>
        </>
      ) : posts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 mb-4" />
          <p className="text-gray-500 font-medium mb-1">아직 문서가 없습니다</p>
          <p className="text-gray-400 text-sm">오른쪽 상단의 <span className="text-indigo-500 font-medium">새 문서</span> 버튼으로 시작하세요</p>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="hidden grid-cols-[minmax(0,1fr)_7rem_7rem_7rem_2.5rem] gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2 text-[11px] font-semibold text-gray-400 md:grid">
              <span>문서</span><span>작성자</span><span>공개 범위</span><span>수정일</span><span aria-hidden="true" />
            </div>
            {posts.map((post) => (
              <div key={post.id} className="group relative border-b border-gray-100 last:border-b-0">
                <Link href={`/dashboard/projects/${projectId}/archive/${post.id}`} className="grid grid-cols-2 gap-1.5 px-3 py-3 pr-14 transition-colors hover:bg-indigo-50/40 md:grid-cols-[minmax(0,1fr)_7rem_7rem_7rem_2.5rem] md:items-center md:gap-3 md:px-4 md:py-3 md:pr-4">
                  <div className="col-span-2 min-w-0 md:col-span-1">
                    <p className="truncate text-sm font-semibold text-gray-900 transition-colors group-hover:text-indigo-700">{post.title}</p>
                    <p className="mt-0.5 text-[11px] text-gray-400">{dayjs(post.updatedAt).format("YYYY.MM.DD HH:mm")}</p>
                  </div>
                  <p className="min-w-0 truncate text-xs font-medium text-gray-600 md:max-w-none">{post.author.name ?? "작성자 없음"}</p>
                  <div className="flex justify-start md:justify-start">
                    {post.visibility === "EXTERNAL" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-600">외부</span>
                    ) : post.visibility === "INTERNAL" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-1.5 py-0.5 text-xs font-medium text-sky-600">내부</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-1.5 py-0.5 text-xs text-gray-400">비공개</span>
                    )}
                  </div>
                  <p className="min-w-0 truncate text-xs text-gray-500 md:max-w-none">{dayjs(post.updatedAt).format("MM.DD HH:mm")}</p>
                  <span aria-hidden="true" className="hidden md:block" />
                </Link>
                <button
                  type="button"
                  onClick={() => deletePost(post.id)}
                  className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-rose-50 hover:text-rose-500 md:right-1"
                  aria-label={`${post.title} 삭제`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}

            <div className="flex items-center justify-center gap-2 border-t border-gray-100 px-4 py-3">
              <button
                type="button"
                onClick={goPreviousPage}
                disabled={!cursorHistory.length || loading || loadingPage}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                이전
              </button>
              <p className="min-w-14 text-center text-xs text-gray-400">
                {cursorHistory.length + 1}페이지
              </p>
              <button
                type="button"
                onClick={goNextPage}
                disabled={!nextCursor || loading || loadingPage}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                다음
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
