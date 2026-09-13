"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Save, Globe, Lock, ArrowLeft, ExternalLink,
  Bold, Italic, Strikethrough, Code, Link2,
  List, ListOrdered, Quote, Minus, Heading1, Heading2, Heading3,
  CheckSquare, CircleHelp, Columns2, ImageIcon, LayoutPanelLeft, Trash2, Upload, X,
} from "lucide-react";
import Link from "next/link";
import { Skeleton } from "./ui/Skeleton";
import { apiFetch } from "@/lib/client-fetch";
import MarkdownRenderer from "./MarkdownRenderer";

type ArchiveVisibility = "PRIVATE" | "INTERNAL" | "EXTERNAL";
type ArchiveKind = "DOCUMENT" | "MEETING";

interface Post {
  id: string;
  title: string;
  content: string;
  slug: string;
  kind: ArchiveKind;
  visibility: ArchiveVisibility;
  shareToken: string | null;
  shareEnabled: boolean;
  published?: boolean;
  publishedAt: string | null;
  author: { name: string | null };
  updatedAt: string;
}

interface Props {
  projectId: string;
  postId: string;
}

interface ArchiveImage {
  id: string;
  storageKey: string;
  url: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
}

type ToolbarAction =
  | { type: "line"; prefix: string; placeholder: string }
  | { type: "around"; before: string; after: string; placeholder: string }
  | { type: "template"; value: string; cursorText: string }
  | { type: "layout"; layout: "columns" | "image" }
  | { type: "rule" };

const TOOLBAR: { group: string; items: { icon: React.ReactNode; title: string; action: ToolbarAction }[] }[] = [
  { group: "heading", items: [
    { icon: <Heading1 size={14} />, title: "제목1", action: { type: "line", prefix: "# ", placeholder: "제목 1" } },
    { icon: <Heading2 size={14} />, title: "제목2", action: { type: "line", prefix: "## ", placeholder: "제목 2" } },
    { icon: <Heading3 size={14} />, title: "제목3", action: { type: "line", prefix: "### ", placeholder: "제목 3" } },
  ]},
  { group: "inline", items: [
    { icon: <Bold size={14} />, title: "굵게 (⌘B)", action: { type: "around", before: "**", after: "**", placeholder: "굵은 텍스트" } },
    { icon: <Italic size={14} />, title: "기울임 (⌘I)", action: { type: "around", before: "_", after: "_", placeholder: "기울임 텍스트" } },
    { icon: <Strikethrough size={14} />, title: "취소선", action: { type: "around", before: "~~", after: "~~", placeholder: "텍스트" } },
    { icon: <Code size={14} />, title: "인라인 코드", action: { type: "around", before: "`", after: "`", placeholder: "코드" } },
  ]},
  { group: "block", items: [
    { icon: <List size={14} />, title: "목록", action: { type: "line", prefix: "- ", placeholder: "항목" } },
    { icon: <ListOrdered size={14} />, title: "번호 목록", action: { type: "line", prefix: "1. ", placeholder: "항목" } },
    { icon: <CheckSquare size={14} />, title: "체크리스트", action: { type: "line", prefix: "- [ ] ", placeholder: "항목" } },
    { icon: <Quote size={14} />, title: "인용", action: { type: "line", prefix: "> ", placeholder: "인용 텍스트" } },
  ]},
  { group: "misc", items: [
    { icon: <Link2 size={14} />, title: "링크", action: { type: "around", before: "[", after: "](https://)", placeholder: "링크 텍스트" } },
    { icon: <ImageIcon size={14} />, title: "이미지 URL", action: { type: "template", value: "![이미지 설명](https://이미지-url)\n", cursorText: "이미지 설명" } },
    { icon: <Columns2 size={14} />, title: "2열 블록 추가", action: { type: "layout", layout: "columns" } },
    { icon: <LayoutPanelLeft size={14} />, title: "이미지 블록 추가", action: { type: "layout", layout: "image" } },
    { icon: <Minus size={14} />, title: "구분선", action: { type: "rule" } },
  ]},
];

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

function insertTemplate(
  textarea: HTMLTextAreaElement,
  value: string,
  cursorText: string,
  onChange: (value: string) => void
) {
  const start = textarea.selectionStart;
  const nextValue = textarea.value.slice(0, start) + value + textarea.value.slice(textarea.selectionEnd);
  const cursorStart = start + value.indexOf(cursorText);
  onChange(nextValue);
  setTimeout(() => {
    textarea.focus();
    textarea.selectionStart = cursorStart;
    textarea.selectionEnd = cursorStart + cursorText.length;
  }, 0);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function isSafeImageUrl(value: string) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export default function ArchiveEditor({ projectId, postId }: Props) {
  const [post, setPost] = useState<Post | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [visibility, setVisibility] = useState<ArchiveVisibility>("PRIVATE");
  const [kind, setKind] = useState<ArchiveKind>("DOCUMENT");
  const [viewMode, setViewMode] = useState<"split" | "editor" | "preview">("split");
  const [isMobile, setIsMobile] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showHtmlHelp, setShowHtmlHelp] = useState(false);
  const [images, setImages] = useState<ArchiveImage[]>([]);
  const [draggingImages, setDraggingImages] = useState(false);
  const [layoutBuilder, setLayoutBuilder] = useState<"columns" | "image" | null>(null);
  const [leftColumn, setLeftColumn] = useState("");
  const [rightColumn, setRightColumn] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [imageCaption, setImageCaption] = useState("");
  const [imageAlign, setImageAlign] = useState("center");
  const [imageSize, setImageSize] = useState("medium");
  const [layoutError, setLayoutError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const builderImageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch(`/api/projects/${projectId}/archive/${postId}`);
        const data: Post = await res.json();
        setPost(data);
        setTitle(data.title);
        setContent(data.content);
        setKind((data.kind ?? "DOCUMENT") as ArchiveKind);
        setVisibility((data.visibility ?? (data.published ? "EXTERNAL" : "PRIVATE")) as ArchiveVisibility);
        const imagesResponse = await apiFetch(`/api/projects/${projectId}/archive/${postId}/images`);
        if (imagesResponse.ok) {
          const imageData = await imagesResponse.json();
          setImages(Array.isArray(imageData) ? imageData : []);
        }
      } catch {
      }
    })();
  }, [projectId, postId]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");

    const updateMobileState = () => {
      setIsMobile(mediaQuery.matches);
    };

    updateMobileState();
    mediaQuery.addEventListener("change", updateMobileState);

    return () => mediaQuery.removeEventListener("change", updateMobileState);
  }, []);

  useEffect(() => {
    if (isMobile && viewMode === "split") {
      // avoid synchronous setState in effect to prevent cascading renders
      setTimeout(() => setViewMode("editor"), 0);
    }
  }, [isMobile, viewMode]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/archive/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, visibility, kind }),
      });
      if (res.ok) {
        const next = await res.json();
        setPost(next);
        setVisibility((next.visibility ?? (next.published ? "EXTERNAL" : "PRIVATE")) as ArchiveVisibility);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
    } finally {
      setSaving(false);
    }
  }, [projectId, postId, title, content, visibility, kind]);

  const togglePublish = async () => {
    setPublishing(true);
    try {
      const nextVisibility = visibility === "EXTERNAL" ? "PRIVATE" : "EXTERNAL";
      const res = await apiFetch(`/api/projects/${projectId}/archive/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, visibility: nextVisibility, kind }),
      });
      if (res.ok) {
        const next = await res.json();
        setPost(next);
        setVisibility((next.visibility ?? (next.published ? "EXTERNAL" : "PRIVATE")) as ArchiveVisibility);
      }
    } catch {
    } finally {
      setPublishing(false);
    }
  };

  const updateShareLink = async (shareAction: "revoke" | "regenerate") => {
    setSharing(true);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/archive/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareAction }),
      });
      if (res.ok) setPost(await res.json());
    } catch {
    } finally {
      setSharing(false);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); save(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [save]);

  const runToolbarAction = (action: ToolbarAction) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    if (action.type === "line") {
      insertLine(textarea, action.prefix, action.placeholder, setContent);
    } else if (action.type === "around") {
      insertAround(textarea, action.before, action.after, action.placeholder, setContent);
    } else if (action.type === "template") {
      insertTemplate(textarea, action.value, action.cursorText, setContent);
    } else if (action.type === "layout") {
      setLayoutBuilder(action.layout);
      setLayoutError("");
      if (action.layout === "columns") { setLeftColumn(""); setRightColumn(""); }
      else { setImageUrl(""); setImageAlt(""); setImageCaption(""); setImageAlign("center"); setImageSize("medium"); }
    } else {
      const value = textarea.value;
      const start = textarea.selectionStart;
      setContent(value.slice(0, start) + "\n---\n" + value.slice(start));
      setTimeout(() => {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + 5;
      }, 0);
    }
  };

  const insertLayoutBlock = () => {
    const textarea = textareaRef.current;
    if (!textarea || !layoutBuilder) return;
    if (layoutBuilder === "columns") {
      const left = escapeHtml(leftColumn.trim() || "왼쪽 내용");
      const right = escapeHtml(rightColumn.trim() || "오른쪽 내용");
      insertTemplate(textarea, `<section class="md-grid md-grid--two">\n  <div>\n    ${left}\n  </div>\n  <div>\n    ${right}\n  </div>\n</section>\n`, left, setContent);
    } else {
      const url = imageUrl.trim();
      if (!isSafeImageUrl(url)) { setLayoutError("HTTPS 이미지 주소를 입력하거나 업로드한 이미지를 선택하세요."); return; }
      const alt = escapeHtml(imageAlt.trim() || "이미지");
      const caption = escapeHtml(imageCaption.trim());
      const captionMarkup = caption ? `\n  <figcaption>${caption}</figcaption>` : "";
      insertTemplate(textarea, `<figure class="md-figure md-figure--${imageAlign} md-figure--${imageSize} md-figure--rounded">\n  <img src="${url}" alt="${alt}" />${captionMarkup}\n</figure>\n`, alt, setContent);
    }
    setLayoutBuilder(null);
  };

  const uploadImage = async (file: File, onUploaded?: (image: ArchiveImage) => void) => {
    const textarea = textareaRef.current;
    if (!textarea && !onUploaded) return;
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await apiFetch(`/api/projects/${projectId}/archive/${postId}/images`, { method: "POST", body: formData });
      const image = await response.json();
      if (!response.ok) throw new Error(image.error ?? "이미지 업로드에 실패했습니다.");
      setImages((current) => [image, ...current]);
      if (onUploaded) onUploaded(image);
      else if (textarea) {
        const alt = file.name.replace(/\.[^.]+$/, "") || "이미지";
        insertTemplate(textarea, `![${alt}](${image.url})\n`, alt, setContent);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : "이미지 업로드에 실패했습니다.");
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
      if (builderImageInputRef.current) builderImageInputRef.current.value = "";
    }
  };

  const uploadImages = async (files: File[]) => {
    for (const file of files) await uploadImage(file);
  };

  const insertUploadedImage = (image: ArchiveImage) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    insertTemplate(textarea, `![이미지](${image.url})\n`, "이미지", setContent);
  };

  const deleteImage = async (image: ArchiveImage) => {
    if (!confirm("첨부 이미지를 삭제하시겠습니까? 본문에 삽입된 이미지는 별도로 제거해야 합니다.")) return;
    try {
      const response = await apiFetch(`/api/projects/${projectId}/archive/${postId}/images/${image.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "이미지 삭제에 실패했습니다.");
      setImages((current) => current.filter((item) => item.id !== image.id));
    } catch (error) {
      alert(error instanceof Error ? error.message : "이미지 삭제에 실패했습니다.");
    }
  };

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
      <div className="flex items-center justify-between px-3 md:px-5 py-3 border-b border-gray-100 flex-shrink-0 bg-white z-10">
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
        <div className="hidden md:flex items-center bg-gray-100 rounded-xl p-0.5 mx-4 flex-shrink-0">
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
          <div className="flex items-center gap-2">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ArchiveKind)}
              className="rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 outline-none focus:border-indigo-300"
            >
              <option value="DOCUMENT">일반 문서</option>
              <option value="MEETING">회의록</option>
            </select>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as ArchiveVisibility)}
              className="rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 outline-none focus:border-indigo-300"
            >
              <option value="PRIVATE">비공개</option>
              <option value="INTERNAL">내부 공유</option>
              <option value="EXTERNAL">외부 공유</option>
            </select>
            <button
              onClick={togglePublish}
              disabled={publishing}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium hover:-translate-y-0.5 transition-all ${
                visibility === "EXTERNAL"
                  ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 shadow-sm hover:shadow"
                  : visibility === "INTERNAL"
                    ? "bg-sky-50 text-sky-700 hover:bg-sky-100 shadow-sm hover:shadow"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {visibility === "EXTERNAL" ? <Globe size={12} /> : visibility === "INTERNAL" ? <Globe size={12} /> : <Lock size={12} />}
              {visibility === "EXTERNAL" ? "외부 공개" : visibility === "INTERNAL" ? "내부 공유" : "비공개"}
            </button>
          </div>
          {visibility === "EXTERNAL" && post.shareEnabled && post.shareToken && (
            <a
              href={`/p/${post.shareToken}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              <ExternalLink size={12} />
              공개 링크
            </a>
          )}
          {visibility === "EXTERNAL" && (
            <button
              onClick={() => updateShareLink(post.shareEnabled ? "revoke" : "regenerate")}
              disabled={sharing}
              className="text-xs font-medium text-gray-500 hover:text-gray-800 disabled:opacity-50"
            >
              {sharing ? "처리 중..." : post.shareEnabled ? "링크 폐기" : "링크 재생성"}
            </button>
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
                  onMouseDown={(e) => { e.preventDefault(); runToolbarAction(item.action); }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-indigo-700 hover:bg-indigo-50 transition-colors"
                >
                  {item.icon}
                </button>
              ))}
            </div>
          ))}
          <div className="flex items-center gap-0.5 border-l border-gray-200 pl-2">
            <input ref={imageInputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) void uploadImages(files); }} />
            <button type="button" title="이미지 파일 업로드" disabled={uploadingImage} onMouseDown={(event) => event.preventDefault()} onClick={() => imageInputRef.current?.click()} className="flex h-7 items-center gap-1 rounded-lg px-1.5 text-gray-500 transition-colors hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50">
              <Upload size={14} />
              <span className="hidden text-xs sm:inline">{uploadingImage ? "업로드 중" : "이미지"}</span>
            </button>
            <button type="button" title="HTML 레이아웃 도움말" onClick={() => setShowHtmlHelp((current) => !current)} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-indigo-50 hover:text-indigo-700"><CircleHelp size={14} /></button>
          </div>
          <div className="ml-auto text-xs text-gray-300 hidden sm:block">
            Cmd+S 저장 · Tab 들여쓰기
          </div>
        </div>
      )}

      {showHtmlHelp && viewMode !== "preview" && (
        <div className="border-b border-indigo-100 bg-indigo-50 px-5 py-3 text-xs text-indigo-900">
          <p className="font-semibold">레이아웃 도움말</p>
          <p className="mt-1 leading-5">2열 블록과 이미지 블록 버튼을 누르면 입력 화면이 열립니다. HTML을 직접 작성할 필요 없이 내용을 입력하고 삽입하세요. 안전하지 않은 HTML과 스크립트는 렌더링되지 않습니다.</p>
        </div>
      )}

      {layoutBuilder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={() => setLayoutBuilder(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold tracking-wide text-indigo-600">CONTENT BLOCK</p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">{layoutBuilder === "columns" ? "2열 블록 추가" : "이미지 블록 추가"}</h2>
                <p className="mt-1 text-xs text-slate-500">{layoutBuilder === "columns" ? "각 영역에 표시할 내용을 입력하세요." : "이미지의 표시 방식과 설명을 정하세요."}</p>
              </div>
              <button type="button" onClick={() => setLayoutBuilder(null)} aria-label="블록 추가 닫기" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={17} /></button>
            </div>
            {layoutBuilder === "columns" ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-600">왼쪽 영역<textarea value={leftColumn} onChange={(event) => setLeftColumn(event.target.value)} rows={7} placeholder="왼쪽에 넣을 내용" className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-200" /></label>
                <label className="text-xs font-semibold text-slate-600">오른쪽 영역<textarea value={rightColumn} onChange={(event) => setRightColumn(event.target.value)} rows={7} placeholder="오른쪽에 넣을 내용" className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-200" /></label>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 p-3">
                  <input ref={builderImageInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file, (image) => { setImageUrl(image.url); setImageAlt(file.name.replace(/\.[^.]+$/, "") || "이미지"); setLayoutError(""); }); }} />
                  <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-slate-800">사진 업로드</p><p className="mt-0.5 text-xs text-slate-500">JPEG, PNG, WebP, GIF · 최대 4MB</p></div><button type="button" disabled={uploadingImage} onClick={() => builderImageInputRef.current?.click()} className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-bold text-indigo-700 shadow-sm ring-1 ring-indigo-100 hover:bg-indigo-50 disabled:opacity-50"><Upload size={14} />{uploadingImage ? "업로드 중…" : "파일 선택"}</button></div>
                </div>
                {images.length > 0 && <div><p className="text-xs font-semibold text-slate-600">업로드한 이미지</p><div className="mt-2 flex gap-2 overflow-x-auto">{images.map((image) => <button key={image.id} type="button" onClick={() => { setImageUrl(image.url); setLayoutError(""); }} className={`h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border-2 ${imageUrl === image.url ? "border-indigo-500" : "border-transparent"}`}><img src={image.url} alt="첨부 이미지 선택" className="h-full w-full object-cover" /></button>)}</div></div>}
                <label className="block text-xs font-semibold text-slate-600">이미지 주소<input value={imageUrl} onChange={(event) => { setImageUrl(event.target.value); setLayoutError(""); }} placeholder="https://..." className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-200" /></label>
                <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">대체 텍스트<input value={imageAlt} onChange={(event) => setImageAlt(event.target.value)} placeholder="이미지 설명" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-indigo-200" /></label><label className="text-xs font-semibold text-slate-600">캡션 <span className="font-normal text-slate-400">(선택)</span><input value={imageCaption} onChange={(event) => setImageCaption(event.target.value)} placeholder="사진 설명" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-indigo-200" /></label></div>
                <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">정렬<select value={imageAlign} onChange={(event) => setImageAlign(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:ring-2 focus:ring-indigo-200"><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option></select></label><label className="text-xs font-semibold text-slate-600">크기<select value={imageSize} onChange={(event) => setImageSize(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:ring-2 focus:ring-indigo-200"><option value="small">작게</option><option value="medium">보통</option><option value="large">크게</option><option value="full">전체 너비</option></select></label></div>
              </div>
            )}
            {layoutError && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{layoutError}</p>}
            <div className="mt-5 flex gap-2"><button type="button" onClick={() => setLayoutBuilder(null)} className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200">취소</button><button type="button" onClick={insertLayoutBlock} className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500">문서에 삽입</button></div>
          </div>
        </div>
      )}

      {images.length > 0 && viewMode !== "preview" && (
        <div className="flex items-center gap-2 overflow-x-auto border-b border-gray-100 bg-white px-5 py-2">
          <span className="flex-shrink-0 text-xs font-medium text-gray-400">첨부 이미지 {images.length}개 · 클릭해 삽입</span>
          {images.map((image) => (
            <div key={image.id} className="group relative flex h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <button type="button" onClick={() => insertUploadedImage(image)} className="h-full w-full"><img src={image.url} alt="업로드한 첨부 이미지" className="h-full w-full object-cover" /></button>
              <button type="button" onClick={() => void deleteImage(image)} className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100" aria-label="첨부 이미지 삭제" title="첨부 이미지 삭제"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="md:hidden flex items-center gap-1 px-3 py-3 border-b border-gray-100 bg-white flex-shrink-0">
        {(["editor", "preview"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setViewMode(m)}
            className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
              viewMode === m ? "bg-gray-900 text-white shadow-sm" : "bg-gray-100 text-gray-600"
            }`}
          >
            {m === "editor" ? "편집" : "미리보기"}
          </button>
        ))}
      </div>

      {/* ── Editor / Preview Body ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor pane - 모바일에서 split일 때 editor만 표시 */}
        {(viewMode === "editor" || viewMode === "split") && (
          <div className={`flex flex-col ${viewMode === "split" ? "hidden md:flex w-1/2 border-r border-gray-100" : "w-full"} overflow-hidden`}>
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
              onDragEnter={(event) => { event.preventDefault(); setDraggingImages(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDraggingImages(false)}
              onDrop={(event) => { event.preventDefault(); setDraggingImages(false); const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/")); if (files.length) void uploadImages(files); }}
              spellCheck={false}
              className={`flex-1 p-4 md:p-6 text-sm text-gray-800 leading-relaxed resize-none outline-none font-mono bg-white placeholder-gray-300 ${draggingImages ? "bg-indigo-50 ring-2 ring-inset ring-indigo-300" : ""}`}
              placeholder={`# 문서 제목\n\n내용을 마크다운으로 작성하세요...\n\n**굵게**, _기울임_, \`코드\`, [링크](url)\n\n- 목록 항목\n- [ ] 체크리스트\n\n> 인용문`}
            />
          </div>
        )}

        {/* Preview pane */}
        {(viewMode === "preview" || viewMode === "split") && (
          <div className={`flex flex-col ${viewMode === "split" ? "w-full md:w-1/2" : "w-full"} overflow-hidden`}>
            {viewMode === "split" && (
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex-shrink-0">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">미리보기</span>
              </div>
            )}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-2xl mx-auto px-4 md:px-8 py-6 md:py-8">
                {viewMode === "preview" && title && (
                  <h1 className="text-3xl font-bold text-gray-900 mb-8 pb-4 border-b border-gray-100">
                    {title}
                  </h1>
                )}
                {content.trim() ? (
                  <MarkdownRenderer content={content} className="prose prose-sm prose-gray max-w-none
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
                  " />
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
