"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Globe, Lock, Trash2, FileText, Clock } from "lucide-react";
import dayjs from "dayjs";
import "dayjs/locale/ko";
import { Skeleton } from "./ui/Skeleton";

dayjs.locale("ko");

interface Post {
  id: string;
  title: string;
  content: string;
  slug: string;
  published: boolean;
  updatedAt: string;
  author: { name: string | null };
}

export default function ArchiveList({ projectId }: { projectId: string }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/projects/${projectId}/archive`)
      .then((r) => r.json())
      .then((data) => { setPosts(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [projectId]);

  const createPost = async () => {
    setCreating(true);
    const res = await fetch(`/api/projects/${projectId}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "제목 없음" }),
    });
    setCreating(false);
    if (res.ok) {
      const post = await res.json();
      router.push(`/dashboard/projects/${projectId}/archive/${post.id}`);
    }
  };

  const deletePost = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("이 문서를 삭제하시겠습니까?")) return;
    await fetch(`/api/projects/${projectId}/archive/${id}`, { method: "DELETE" });
    setPosts((prev) => prev.filter((p) => p.id !== id));
  };

  const getPreview = (content: string) => {
    if (!content.trim()) return null;
    // Strip markdown syntax for plain preview
    return content
      .replace(/#{1,6}\s+/g, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/`{1,3}[^`]*`{1,3}/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/>\s+/g, "")
      .replace(/[-*+]\s+/g, "")
      .replace(/\n+/g, " ")
      .trim()
      .slice(0, 120);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-5 flex-shrink-0">
        <p className="text-sm text-gray-500">
          문서 <span className="font-semibold text-gray-800">{posts.length}개</span>
        </p>
        <button
          onClick={createPost}
          disabled={creating}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0"
        >
          <Plus size={14} />
          {creating ? "생성 중..." : "새 문서"}
        </button>
      </div>

      {loading ? (
        <>
          <Skeleton className="h-4 w-24 mb-5 rounded" />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col">
                <div className="p-5 flex-1 space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <Skeleton className="h-4 w-3/4 rounded-lg" />
                    <Skeleton className="w-4 h-4 rounded flex-shrink-0" />
                  </div>
                  <Skeleton className="h-3 w-full rounded" />
                  <Skeleton className="h-3 w-5/6 rounded" />
                  <Skeleton className="h-3 w-2/3 rounded" />
                  <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                    <Skeleton className="h-3 w-16 rounded" />
                    <Skeleton className="h-5 w-12 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : posts.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
            <FileText size={28} className="text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium mb-1">아직 문서가 없습니다</p>
          <p className="text-gray-400 text-sm">오른쪽 상단의 <span className="text-indigo-500 font-medium">새 문서</span> 버튼으로 시작하세요</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {posts.map((post) => {
              const preview = getPreview(post.content);
              return (
                <Link
                  key={post.id}
                  href={`/dashboard/projects/${projectId}/archive/${post.id}`}
                  className="group relative bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col"
                >
                  {/* Published bar */}
                  {post.published && (
                    <div className="h-1 w-full bg-gradient-to-r from-emerald-400 to-teal-400" />
                  )}

                  <div className="p-5 flex-1 flex flex-col">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h3 className="font-bold text-gray-900 text-sm leading-snug line-clamp-2 group-hover:text-indigo-700 transition-colors flex-1">
                        {post.title}
                      </h3>
                      <button
                        onClick={(e) => deletePost(e, post.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-rose-500 flex-shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {/* Markdown preview */}
                    {preview ? (
                      <p className="text-xs text-gray-400 leading-relaxed line-clamp-3 flex-1 mb-3">
                        {preview}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-300 italic flex-1 mb-3">내용 없음</p>
                    )}

                    <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <Clock size={10} />
                        <span>{dayjs(post.updatedAt).format("MM.DD HH:mm")}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {post.published ? (
                          <span className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                            <Globe size={9} />
                            공개
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
                            <Lock size={9} />
                            비공개
                          </span>
                        )}
                        {post.author.name && (
                          <span className="text-xs text-gray-300">{post.author.name}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}

            {/* Add new card */}
            <button
              onClick={createPost}
              disabled={creating}
              className="bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all flex flex-col items-center justify-center gap-2 text-gray-300 hover:text-indigo-400 min-h-[140px] p-5 disabled:opacity-60"
            >
              <Plus size={24} />
              <span className="text-xs font-medium">새 문서</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
