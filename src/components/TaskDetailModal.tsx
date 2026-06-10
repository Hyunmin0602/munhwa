"use client";
import { useState, useEffect, useRef } from "react";
import { X, Trash2, Calendar, User, Flag, AlignLeft } from "lucide-react";

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  dueDate: string | null;
  columnId: string;
  assignee: { id: string; name: string | null } | null;
}

interface Member {
  id: string;
  name: string | null;
}

interface Props {
  task: Task;
  projectId: string;
  members: Member[];
  onClose: () => void;
  onUpdate: (task: Task) => void;
  onDelete: () => void;
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
  const [dirty, setDirty] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  const mark = () => setDirty(true);

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
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
    });
    setSaving(false);
    if (res.ok) {
      const updated = await res.json();
      onUpdate(updated);
      setDirty(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("이 카드를 삭제하시겠습니까?")) return;
    await fetch(`/api/projects/${projectId}/tasks/${task.id}`, { method: "DELETE" });
    onDelete();
  };

  // close on backdrop click
  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      if (dirty) save().then(() => onClose());
      else onClose();
    }
  };

  // Cmd+Enter saves
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); save(); }
      if (e.key === "Escape") { if (dirty) save().then(() => onClose()); else onClose(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [title, description, priority, dueDate, assigneeId, dirty]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={handleBackdrop}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">카드 상세</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"
              title="삭제"
            >
              <Trash2 size={14} />
            </button>
            <button
              onClick={() => { if (dirty) save().then(() => onClose()); else onClose(); }}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto">
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                <Calendar size={11} />
                마감일
              </div>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => { setDueDate(e.target.value); mark(); }}
                className="w-full text-sm text-gray-700 bg-gray-50 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200 transition border border-gray-100"
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
                className="w-full text-sm text-gray-700 bg-gray-50 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200 transition border border-gray-100"
              >
                <option value="">없음</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name ?? m.id}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {dirty ? "저장되지 않은 변경사항" : "변경사항 없음"}
          </span>
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-40"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
