"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeHighlight from "rehype-highlight";
import {
  Save, Globe, Lock, ArrowLeft, ExternalLink,
  Bold, Italic, Strikethrough, Code, Link2,
  List, ListOrdered, Quote, Minus, Heading1, Heading2, Heading3,
  CheckSquare, ImageIcon, LayoutPanelLeft,
} from "lucide-react";
import Link from "next/link";
import { Skeleton } from "./ui/Skeleton";

interface Post {
  id: string;
  title: string;
  content: string;
  slug: string;
  published: boolean;
  publishedAt: string | null;
  author: { name: string | null };
  updatedAt: string;
}

interface Props {
  projectId: string;
  postId: string;
}

// --- Toolbar helpers ---
function insertAround(
  textarea: HTMLTextAreaElement,
  before: string,
  after: string,
  placeholder: string,
  onChange: (v: string) => void
) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end) || placeholder;
  const newVal =
    textarea.value.slice(0, start) + before + selected + after + textarea.value.slice(end);
  onChange(newVal);
  setTimeout(() => {
    textarea.focus();
    textarea.selectionStart = start + before.length;
    textarea.selectionEnd = start + before.length + selected.length;
  }, 0);
}

function insertLine(
  textarea: HTMLTextAreaElement,
  prefix: string,
  placeholder: string,
  onChange: (v: string) => void
) {
  const start = textarea.selectionStart;
  const lineStart = textarea.value.lastIndexOf("\n", start - 1) + 1;
  const before = textarea.value.slice(0, lineStart);
  const after = textarea.value.slice(lineStart);
  const newVal = before + prefix + placeholder + "\n" + after;
  onChange(newVal);
  setTimeout(() => {
    textarea.focus();
    const ns = lineStart + prefix.length;
    textarea.selectionStart = ns;
    textarea.selectionEnd = ns + placeholder.length;
  }, 0);
}

export default function ArchiveEditor({ projectId, postId }: Props) {
  const [post, setPost] = useState<Post | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [viewMode, setViewMode] = useState<"split" | "editor" | "preview">("split");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/archive/${postId}`)
      .then((r) => r.json())
      .then((data: Post) => {
        setPost(data);
        setTitle(data.title);
        setContent(data.content);
      });
  }, [projectId, postId]);

  const save = useCallback(async () => {
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/archive/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, published: post?.published }),
    });
    setSaving(false);
    if (res.ok) {
      setPost(await res.json());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }, [projectId, postId, title, content, post?.published]);

  const togglePublish = async () => {
    setPublishing(true);
    const res = await fetch(`/api/projects/${projectId}/archive/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, published: !post?.published }),
    });
    setPublishing(false);
    if (res.ok) setPost(await res.json());
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); save(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [save]);

  // Toolbar action dispatcher
  const ta = () => textareaRef.current!;

  const TOOLBAR = [
    { group: "heading", items: [
      { icon: <Heading1 size={14} />, title: "제목1", action: () => insertLine(ta(), "# ", "제목 1", setContent) },
      { icon: <Heading2 size={14} />, title: "제목2", action: () => insertLine(ta(), "## ", "제목 2", setContent) },
      { icon: <Heading3 size={14} />, title: "제목3", action: () => insertLine(ta(), "### ", "제목 3", setContent) },
    ]},
    { group: "inline", items: [
      { icon: <Bold size={14} />, title: "굵게 (⌘B)", action: () => insertAround(ta(), "**", "**", "굵은 텍스트", setContent) },
      { icon: <Italic size={14} />, title: "기울임 (⌘I)", action: () => insertAround(ta(), "_", "_", "기울임 텍스트", setContent) },
      { icon: <Strikethrough size={14} />, title: "취소선", action: () => insertAround(ta(), "~~", "~~", "텍스트", setContent) },
      { icon: <Code size={14} />, title: "인라인 코드", action: () => insertAround(ta(), "`", "`", "코드", setContent) },
    ]},
    { group: "block", items: [
      { icon: <List size={14} />, title: "목록", action: () => insertLine(ta(), "- ", "항목", setContent) },
      { icon: <ListOrdered size={14} />, title: "번호 목록", action: () => insertLine(ta(), "1. ", "항목", setContent) },
      { icon: <CheckSquare size={14} />, title: "체크리스트", action: () => insertLine(ta(), "- [ ] ", "항목", setContent) },
      { icon: <Quote size={14} />, title: "인용", action: () => insertLine(ta(), "> ", "인용 텍스트", setContent) },
    ]},
    { group: "misc", items: [
      { icon: <Link2 size={14} />, title: "링크", action: () => insertAround(ta(), "[", "](https://)", "링크 텍스트", setContent) },
      { icon: <ImageIcon size={14} />, title: "이미지", action: () => insertLine(ta(), "![이미지](", "https://이미지-url", setContent) },
      { icon: <Minus size={14} />, title: "구분선", action: () => { const t = ta(); const v = t.value; const s = t.selectionStart; setContent(v.slice(0, s) + "\n---\n" + v.slice(s)); setTimeout(() => { t.focus(); t.selectionStart = t.selectionEnd = s + 5; }, 0); } },
    ]},
  ];

  // Tab key indentation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const t = e.currentTarget;
      const s = t.selectionStart;
      setContent(t.value.slice(0, s) + "  " + t.value.slice(s));
      setTimeout(() => { t.selectionStart = t.selectionEnd = s + 2; }, 0);
    }
  };

  if (!post) {
    return (
      <div className="flex flex-col h-full bg-white">
        {/* Top bar skeleton */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-3 flex-1">
            <Skeleton className="w-5 h-5 rounded-lg flex-shrink-0" />
            <Skeleton className="h-6 w-48 rounded-lg" />
          </div>
          <div className="flex items-center gap-2 mx-4">
            <Skeleton className="h-8 w-32 rounded-xl" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-16 rounded-xl" />
            <Skeleton className="h-7 w-14 rounded-xl" />
          </div>
        </div>
        {/* Toolbar skeleton */}
        <div className="flex items-center gap-1 px-5 py-2 border-b border-gray-100 bg-gray-50/80">
          {[...Array(12)].map((_, i) => (
            <Skeleton key={i} className="w-7 h-7 rounded-lg" />
          ))}
        </div>
        {/* Editor area skeleton */}
        <div className="flex-1 flex overflow-hidden">
          <div className="w-1/2 border-r border-gray-100 p-6 space-y-3">
            <Skeleton className="h-5 w-1/3 rounded-lg" />
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-5/6 rounded" />
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-4/5 rounded" />
            <div className="pt-4 space-y-2">
              <Skeleton className="h-4 w-full rounded" />
              <Skeleton className="h-4 w-3/4 rounded" />
            </div>
          </div>
          <div className="w-1/2 p-8 space-y-4">
            <Skeleton className="h-8 w-2/3 rounded-xl" />
            <Skeleton className="h-1 w-full rounded" />
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-5/6 rounded" />
            <Skeleton className="h-4 w-full rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0 bg-white z-10">
        {/* Left */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Link
            href={`/dashboard/projects/${projectId}/archive`}
            className="text-gray-400 hover:text-gray-700 flex-shrink-0 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-base font-bold text-gray-900 bg-transparent outline-none border-none min-w-0 flex-1 placeholder-gray-300 hover:bg-gray-50 focus:bg-gray-50 rounded-lg px-2 py-1 transition-colors"
            placeholder="문서 제목"
          />
        </div>

        {/* Center: view mode toggle */}
        <div className="flex items-center bg-gray-100 rounded-xl p-0.5 mx-4 flex-shrink-0">
          {(["editor", "split", "preview"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {m === "editor" ? "편집" : m === "split" ? "분할" : "미리보기"}
            </button>
          ))}
        </div>

        {/* Right */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {saved && (
            <span className="text-xs text-emerald-600 font-medium animate-fade-in">저장됨 ✓</span>
          )}
          <button
            onClick={togglePublish}
            disabled={publishing}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium hover:-translate-y-0.5 transition-all ${
              post.published
                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 shadow-sm hover:shadow"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {post.published ? <Globe size={12} /> : <Lock size={12} />}
            {post.published ? "공개 중" : "비공개"}
          </button>
          {post.published && (
            <a
              href={`/p/${post.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              <ExternalLink size={12} />
              공개 링크
            </a>
          )}
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0"
          >
            <Save size={12} />
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>

      {/* ── Markdown Toolbar ── */}
      {viewMode !== "preview" && (
        <div className="flex items-center gap-1 px-5 py-2 border-b border-gray-100 bg-gray-50/80 flex-shrink-0 flex-wrap">
          {TOOLBAR.map((group, gi) => (
            <div key={gi} className="flex items-center gap-0.5">
              {gi > 0 && <div className="w-px h-4 bg-gray-200 mx-1" />}
              {group.items.map((item) => (
                <button
                  key={item.title}
                  title={item.title}
                  onMouseDown={(e) => { e.preventDefault(); item.action(); }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-indigo-700 hover:bg-indigo-50 transition-colors"
                >
                  {item.icon}
                </button>
              ))}
            </div>
          ))}
          <div className="ml-auto text-xs text-gray-300 hidden sm:block">
            Cmd+S 저장 · Tab 들여쓰기
          </div>
        </div>
      )}

      {/* ── Editor / Preview Body ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor pane */}
        {(viewMode === "editor" || viewMode === "split") && (
          <div className={`flex flex-col ${viewMode === "split" ? "w-1/2 border-r border-gray-100" : "w-full"} overflow-hidden`}>
            {viewMode === "split" && (
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex-shrink-0">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">편집</span>
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              className="flex-1 p-6 text-sm text-gray-800 leading-relaxed resize-none outline-none font-mono bg-white placeholder-gray-300"
              placeholder={`# 문서 제목\n\n내용을 마크다운으로 작성하세요...\n\n**굵게**, _기울임_, \`코드\`, [링크](url)\n\n- 목록 항목\n- [ ] 체크리스트\n\n> 인용문`}
            />
          </div>
        )}

        {/* Preview pane */}
        {(viewMode === "preview" || viewMode === "split") && (
          <div className={`flex flex-col ${viewMode === "split" ? "w-1/2" : "w-full"} overflow-hidden`}>
            {viewMode === "split" && (
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex-shrink-0">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">미리보기</span>
              </div>
            )}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-2xl mx-auto px-8 py-8">
                {viewMode === "preview" && title && (
                  <h1 className="text-3xl font-bold text-gray-900 mb-8 pb-4 border-b border-gray-100">
                    {title}
                  </h1>
                )}
                {content.trim() ? (
                  <div className="prose prose-sm prose-gray max-w-none
                    prose-headings:font-bold prose-headings:text-gray-900
                    prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg
                    prose-p:text-gray-700 prose-p:leading-relaxed
                    prose-a:text-indigo-600 prose-a:no-underline hover:prose-a:underline
                    prose-code:bg-gray-100 prose-code:text-indigo-700 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
                    prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:rounded-xl prose-pre:text-xs
                    prose-blockquote:border-l-4 prose-blockquote:border-indigo-300 prose-blockquote:bg-indigo-50 prose-blockquote:rounded-r-lg prose-blockquote:not-italic prose-blockquote:text-gray-700
                    prose-li:text-gray-700
                    prose-hr:border-gray-200
                    prose-strong:text-gray-900
                    prose-img:rounded-xl
                    prose-table:text-sm
                    prose-th:bg-gray-50
                  ">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkBreaks]}
                      rehypePlugins={[rehypeHighlight]}
                    >
                      {content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
                      <LayoutPanelLeft size={20} className="text-gray-300" />
                    </div>
                    <p className="text-gray-400 text-sm">왼쪽에서 내용을 작성하면<br />여기에 미리보기가 표시됩니다</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
