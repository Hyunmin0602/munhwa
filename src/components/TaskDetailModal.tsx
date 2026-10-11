"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Trash2, Calendar, User, Flag, AlignLeft, MessageCircle, Send, ArrowLeft, Pencil } from "lucide-react";
import { apiFetch, getModalExceptionMessage, getModalRequestErrorMessage } from "@/lib/client-fetch";
import { ModalErrorAlert } from "@/components/ui/ModalErrorAlert";
import ModalFrame, { ModalCloseActionButton, ModalCloseButton } from "@/components/ui/ModalFrame";

interface Task {
  id: string;
  title: string;
  description?: string | null;
  priority: string;
  dueDate: string | null;
  columnId: string;
  assignee: { id: string; name: string | null } | null;
  comments?: TaskComment[];
}

interface Member {
  id: string;
  name: string | null;
  email?: string;
  mentionable?: boolean;
}

interface TaskComment {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; name: string | null };
}

interface Props {
  task: Task;
  projectId: string;
  members: Member[];
  onClose: () => void;
  onUpdate: (task: Task) => void;
  onDelete: () => Promise<boolean>;
}

const PRIORITIES = [
  { value: "low",    label: "낮음", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "medium", label: "보통", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "high",   label: "높음", cls: "bg-rose-100 text-rose-700 border-rose-200" },
];

export default function TaskDetailModal({ task, projectId, members, onClose, onUpdate, onDelete }: Props) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState(task.priority);
  const [dueDate, setDueDate] = useState(
    task.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : ""
  );
  const [assigneeId, setAssigneeId] = useState(task.assignee?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [selectedMentions, setSelectedMentions] = useState<Array<{ id: string; name: string }>>([]);
  const [mentionQuery, setMentionQuery] = useState<{ start: number; end: number; query: string } | null>(null);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);
  const [commentSaving, setCommentSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const mentionMatches = mentionQuery
    ? members.filter((member) => member.mentionable !== false && !selectedMentions.some((mention) => mention.id === member.id) && `${member.name || ""} ${member.email || ""}`.toLocaleLowerCase().includes(mentionQuery.query.toLocaleLowerCase()))
    : [];

  useEffect(() => {
    if (mobileEditorOpen) titleRef.current?.focus();
  }, [mobileEditorOpen]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await apiFetch(`/api/projects/${projectId}/tasks/${task.id}`, undefined, { showGlobalError: false });
        if (!response.ok) return;
        const detail = await response.json() as Task;
        if (cancelled) return;
        setTitle(detail.title);
        setDescription(detail.description ?? "");
        setPriority(detail.priority);
        setDueDate(detail.dueDate ? new Date(detail.dueDate).toISOString().split("T")[0] : "");
        setAssigneeId(detail.assignee?.id ?? "");
        setComments(detail.comments ?? []);
      } catch {
        // The summary data remains editable if the detail request fails.
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, task.id]);

  const mark = () => setDirty(true);

  const insertMention = (member: Member) => {
    if (!mentionQuery) return;
    const current = commentText;
    const insertedName = member.name?.trim() || "이름 없음";
    const nextText = `${current.slice(0, mentionQuery.start)}@${insertedName} ${current.slice(mentionQuery.end)}`;
    const caret = mentionQuery.start + insertedName.length + 2;
    setCommentText(nextText);
    setSelectedMentions((selected) => selected.some((item) => item.id === member.id) ? selected : [...selected, { id: member.id, name: insertedName }]);
    setMentionQuery(null);
    setMentionActiveIndex(0);
    requestAnimationFrame(() => { commentRef.current?.focus(); commentRef.current?.setSelectionRange(caret, caret); });
  };

  const submitComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!commentText.trim()) return;
    setCommentSaving(true);
    setError("");
    try {
      const response = await apiFetch(`/api/projects/${projectId}/tasks/${task.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentContent: commentText, mentionUserIds: selectedMentions.map((mention) => mention.id) }),
      }, { showGlobalError: false });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message ?? "코멘트를 저장하지 못했습니다.");
      }
      const comment = await response.json() as TaskComment;
      setComments((current) => [...current, comment]);
      setCommentText("");
      setSelectedMentions([]);
      setMentionQuery(null);
      setMentionActiveIndex(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "코멘트를 저장하지 못했습니다.");
    } finally {
      setCommentSaving(false);
    }
  };

  const save = useCallback(async () => {
    if (!title.trim()) return false;
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch(`/api/projects/${projectId}/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description || null,
          priority,
          dueDate: dueDate || null,
          assigneeId: assigneeId || null,
          columnId: task.columnId,
        }),
      }, { showGlobalError: false });
      if (res.ok) {
        const updated = await res.json();
        onUpdate(updated);
        setDirty(false);
        return true;
      }
      setError(await getModalRequestErrorMessage(res, "카드 저장"));
    } catch (requestError) {
      setError(getModalExceptionMessage(requestError, "카드 저장"));
    } finally { setSaving(false); }
    return false;
  }, [assigneeId, description, dueDate, onUpdate, priority, projectId, task.columnId, task.id, title]);

  const saveAndClose = async () => {
    if (!dirty) {
      onClose();
      return;
    }

    const saved = await save();
    if (saved) onClose();
  };

  const handleDelete = async () => {
    if (!confirm("이 카드를 삭제하시겠습니까?")) return;
    if (await onDelete()) onClose();
  };

  // ModalFrame already filters clicks to the backdrop before invoking this callback.
  const closeAfterBackdropClick = async () => {
    if (dirty) { const saved = await save(); if (saved) onClose(); }
    else onClose();
  };

  // Cmd+Enter saves
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); save(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [save]);

  return (
    <ModalFrame title="카드 상세" onClose={onClose} onEscape={async () => { if (dirty) { const saved = await save(); if (saved) onClose(); } else onClose(); }} onBackdropMouseDown={() => closeAfterBackdropClick()} className="max-w-5xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">카드 상세</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setMobileEditorOpen((current) => !current)} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 md:hidden">
              {mobileEditorOpen ? <><ArrowLeft size={13} />댓글로</> : <><Pencil size={13} />수정</>}
            </button>
            <button
              aria-label={`${task.title} 삭제`}
              onClick={handleDelete}
              className="p-1.5 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-50 transition-all hover:scale-110"
              title="삭제"
            >
              <Trash2 size={14} />
            </button>
            <ModalCloseButton label="카드 상세 닫기" onClick={saveAndClose} />
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 overflow-y-auto px-5 py-4 md:grid md:grid-cols-2 md:gap-6 md:px-6">
          <div className={`space-y-4 ${mobileEditorOpen ? "block" : "hidden"} md:block`}>
          {error && <ModalErrorAlert message={error} />}
          {/* Title */}
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => { setTitle(e.target.value); mark(); }}
            className="w-full text-lg font-bold text-gray-900 bg-transparent outline-none border-none placeholder-gray-300 leading-snug"
            placeholder="카드 제목"
          />

          {/* Description */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              <AlignLeft size={11} />
              설명
            </div>
            <textarea
              value={description}
              onChange={(e) => { setDescription(e.target.value); mark(); }}
              rows={4}
              className="w-full text-sm text-gray-700 bg-gray-50 rounded-xl p-3 resize-none outline-none focus:ring-2 focus:ring-indigo-200 transition placeholder-gray-300"
              placeholder="설명을 입력하세요..."
            />
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              <Flag size={11} />
              우선순위
            </div>
            <div className="flex gap-2">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  onClick={() => { setPriority(p.value); mark(); }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-all
                    ${priority === p.value ? p.cls + " ring-2 ring-offset-1 ring-current" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Due date + Assignee */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                <Calendar size={11} />
                마감일
              </div>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => { setDueDate(e.target.value); mark(); }}
                className="min-w-0 w-full text-sm text-gray-700 bg-gray-50 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200 transition border border-gray-100"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                <User size={11} />
                담당자
              </div>
              <select
                value={assigneeId}
                onChange={(e) => { setAssigneeId(e.target.value); mark(); }}
                className="min-w-0 w-full text-sm text-gray-700 bg-gray-50 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200 transition border border-gray-100"
              >
                <option value="">없음</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name ?? m.id}</option>
                ))}
              </select>
            </div>
          </div>
          </div>

          <section className={`border-t border-gray-100 pt-4 md:border-l md:border-t-0 md:pl-6 ${mobileEditorOpen ? "hidden" : "block"} md:block`}>
            <div className="mb-2 flex items-center gap-2"><MessageCircle size={15} className="text-indigo-600" /><h3 className="text-sm font-bold text-gray-800">진행 코멘트</h3><span className="text-xs text-gray-400">{comments.length}</span></div>
            <p className="mb-3 hidden text-xs text-gray-500 md:block">칸반과 캘린더에서 함께 확인할 수 있습니다.</p>
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl bg-gray-50 p-3">
              {comments.length === 0 ? <p className="py-4 text-center text-xs text-gray-400">아직 코멘트가 없습니다.</p> : comments.map((comment) => (
                <article key={comment.id} className="rounded-lg border border-gray-100 bg-white p-3">
                  <div className="mb-1 flex items-center justify-between gap-3"><span className="text-xs font-semibold text-gray-700">{comment.author.name || "이름 없음"}</span><time className="text-[10px] text-gray-400">{new Date(comment.createdAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-5 text-gray-700">{comment.content}</p>
                </article>
              ))}
            </div>
            <form onSubmit={submitComment} className="relative mt-3 flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <textarea ref={commentRef} value={commentText} onChange={(event) => {
                  const value = event.target.value;
                  setCommentText(value);
                  setSelectedMentions((current) => current.filter((mention) => value.includes(`@${mention.name}`)));
                  const caret = event.target.selectionStart;
                  const beforeCaret = value.slice(0, caret);
                  const match = beforeCaret.match(/(^|\s)@([\p{L}\p{N}._-]*)$/u);
                  if (match) {
                    setMentionQuery({ start: caret - match[2].length - 1, end: caret, query: match[2] });
                    setMentionActiveIndex(0);
                  } else setMentionQuery(null);
                }} onKeyDown={(event) => {
                  if (event.key === "Escape" && mentionQuery) { event.preventDefault(); setMentionQuery(null); }
                  if (event.key === "ArrowDown" && mentionQuery && mentionMatches.length) { event.preventDefault(); setMentionActiveIndex((current) => Math.min(current + 1, mentionMatches.length - 1)); }
                  if (event.key === "ArrowUp" && mentionQuery && mentionMatches.length) { event.preventDefault(); setMentionActiveIndex((current) => Math.max(current - 1, 0)); }
                  if (event.key === "Enter" && mentionQuery && mentionMatches.length) { event.preventDefault(); insertMention(mentionMatches[mentionActiveIndex]); }
                }} maxLength={2000} rows={2} placeholder="댓글을 입력하세요. @를 입력해 멘션할 수 있습니다." className="min-h-11 w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
                {mentionQuery && <div role="listbox" aria-label="멘션할 구성원" className="absolute bottom-full left-0 z-10 mb-2 max-h-48 w-[min(20rem,85vw)] overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-xl">
                  {mentionMatches.length ? mentionMatches.map((member, index) => <button key={member.id} type="button" role="option" aria-selected={index === mentionActiveIndex} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setMentionActiveIndex(index)} onClick={() => insertMention(member)} className={`block w-full px-3 py-2 text-left text-sm text-gray-700 ${index === mentionActiveIndex ? "bg-indigo-50" : "hover:bg-indigo-50"}`}><span className="font-medium">{member.name || "이름 없음"}</span>{member.email && <span className="ml-2 text-xs text-gray-400">{member.email}</span>}</button>) : <p className="px-3 py-2 text-xs text-gray-400">일치하는 구성원이 없습니다.</p>}
                </div>}
              </div>
              <button type="submit" disabled={commentSaving || !commentText.trim()} className="inline-flex h-10 items-center gap-1 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white disabled:opacity-50"><Send size={13} /><span className="hidden sm:inline">등록</span></button>
            </form>
          </section>
        </div>

        {/* Footer */}
        <div className={`px-5 py-3 border-t border-gray-100 items-center justify-between ${mobileEditorOpen ? "flex" : "hidden"} md:flex`}>
          <span className="text-xs text-gray-400">
            {dirty ? "저장되지 않은 변경사항" : "변경사항 없음"}
          </span>
          <ModalCloseActionButton
            onClick={saveAndClose}
            disabled={saving}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0"
          >
            {saving ? "저장 중..." : "저장 및 닫기"}
          </ModalCloseActionButton>
        </div>
    </ModalFrame>
  );
}
