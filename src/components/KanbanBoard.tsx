"use client";
import { useState, useEffect, useRef } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus, Trash2, Calendar, User, GripVertical,
  ChevronLeft, ChevronRight, Pencil, Check, RotateCw, AlertCircle, X as XIcon,
} from "lucide-react";
import TaskDetailModal from "./TaskDetailModal";
import { apiFetch } from "@/lib/client-fetch";
import { Skeleton } from "./ui/Skeleton";

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  dueDate: string | null;
  columnId: string;
  assignee: { id: string; name: string | null } | null;
}

interface Column {
  id: string;
  name: string;
  order: number;
  tasks: Task[];
}

interface Member {
  id: string;
  name: string | null;
}

interface Props {
  projectId: string;
}

const PRIORITY: Record<string, { label: string; cls: string; dot: string }> = {
  low:    { label: "낮음", cls: "text-emerald-600 bg-emerald-50", dot: "bg-emerald-400" },
  medium: { label: "보통", cls: "text-amber-600 bg-amber-50",    dot: "bg-amber-400" },
  high:   { label: "높음", cls: "text-rose-600 bg-rose-50",      dot: "bg-rose-400" },
};

const COLUMN_COLORS = [
  "border-t-slate-400",
  "border-t-indigo-400",
  "border-t-emerald-400",
  "border-t-amber-400",
  "border-t-rose-400",
  "border-t-purple-400",
];

const columnDragId = (columnId: string) => `column:${columnId}`;
const getColumnIdFromDragId = (id: string) => id.startsWith("column:") ? id.slice("column:".length) : id;

function TaskCard({
  task, onDelete, onMoveLeft, onMoveRight,
  canMoveLeft, canMoveRight, prevColName, nextColName, onClick,
}: {
  task: Task; onDelete: () => void; onMoveLeft: () => void; onMoveRight: () => void;
  canMoveLeft: boolean; canMoveRight: boolean; prevColName: string; nextColName: string;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortDragging } = useSortable({ id: task.id, data: { type: "task", task } });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const p = PRIORITY[task.priority] ?? PRIORITY.medium;

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const [swipeDx, setSwipeDx] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const didSwipe = useRef(false);
  const THRESHOLD = 72;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setSwiping(false); setSwipeDx(0); didSwipe.current = false;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (!swiping && Math.abs(dy) > Math.abs(dx)) return;
    if (Math.abs(dx) > 6) setSwiping(true);
    if (swiping) {
      const clamped = Math.max(canMoveLeft ? -THRESHOLD * 1.2 : 0, Math.min(canMoveRight ? THRESHOLD * 1.2 : 0, dx));
      setSwipeDx(clamped);
      if (Math.abs(clamped) > 10) didSwipe.current = true;
    }
  };
  const handleTouchEnd = () => {
    if (swipeDx >= THRESHOLD && canMoveRight) onMoveRight();
    else if (swipeDx <= -THRESHOLD && canMoveLeft) onMoveLeft();
    setSwipeDx(0); setSwiping(false); touchStartX.current = null;
  };

  const showRight = swipeDx > 12 && canMoveRight;
  const showLeft  = swipeDx < -12 && canMoveLeft;

  return (
    <div ref={setNodeRef} style={style} className={`relative rounded-xl overflow-hidden select-none ${isSortDragging ? "opacity-40 scale-95" : ""}`}>
      <div className={`absolute inset-y-0 left-0 flex items-center justify-start px-3 rounded-l-xl pointer-events-none bg-indigo-500 text-white text-xs font-semibold gap-1 transition-all duration-100 ${showLeft ? "opacity-100 w-20" : "opacity-0 w-0"}`}>
        <ChevronLeft size={14} /><span className="truncate">{prevColName}</span>
      </div>
      <div className={`absolute inset-y-0 right-0 flex items-center justify-end px-3 rounded-r-xl pointer-events-none bg-emerald-500 text-white text-xs font-semibold gap-1 transition-all duration-100 ${showRight ? "opacity-100 w-20" : "opacity-0 w-0"}`}>
        <span className="truncate">{nextColName}</span><ChevronRight size={14} />
      </div>
      <div
        {...attributes}
        {...listeners}
        style={{ transform: `translateX(${swipeDx}px)`, transition: swiping ? "none" : "transform 0.2s ease" }}
        onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
        onClick={() => { if (!didSwipe.current) onClick(); }}
        className={`bg-white border border-gray-150 shadow-sm group rounded-xl cursor-grab active:cursor-grabbing touch-none ${!isSortDragging ? "hover:shadow-md hover:border-indigo-200" : ""}`}
      >
        <div className="p-3.5">
          <div className="flex items-start gap-2">
            <button type="button" tabIndex={-1} onClick={(e) => e.stopPropagation()} className="mt-0.5 text-gray-300 group-hover:text-gray-400 flex-shrink-0 pointer-events-none" aria-hidden="true">
              <GripVertical size={14} />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 leading-snug line-clamp-2 mb-2">{task.title}</p>
              {task.description && <p className="text-xs text-gray-400 line-clamp-2 mb-2 leading-relaxed">{task.description}</p>}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md font-medium ${p.cls}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />{p.label}
                </span>
                {task.dueDate && <span className="inline-flex items-center gap-1 text-xs text-gray-400"><Calendar size={10} />{new Date(task.dueDate).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}</span>}
                {task.assignee?.name && <span className="inline-flex items-center gap-1 text-xs text-gray-400 ml-auto"><User size={10} />{task.assignee.name}</span>}
              </div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-rose-400 flex-shrink-0 mt-0.5">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddTaskInline({ onAdd, onAddDetails, onCancel }: {
  onAdd: (title: string) => Promise<boolean>;
  onAddDetails: (title: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState<"quick" | "details" | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const submit = async (mode: "quick" | "details") => {
    const trimmed = title.trim();
    if (!trimmed) { onCancel(); return; }
    setSubmitting(mode);
    const added = mode === "details" ? await onAddDetails(trimmed) : await onAdd(trimmed);
    if (!added) setSubmitting(null);
  };
  return (
    <div className="bg-white rounded-xl border border-indigo-300 shadow-sm ring-1 ring-indigo-200 p-3">
      <textarea ref={ref} value={title} onChange={(e) => setTitle(e.target.value)}
        disabled={submitting !== null}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit("quick"); } if (e.key === "Escape") onCancel(); }}
        placeholder="태스크 제목 입력 후 Enter..." rows={2}
        className="w-full text-sm text-gray-800 resize-none outline-none placeholder-gray-300 disabled:opacity-60" />
      <div className="grid grid-cols-[1fr_1.5fr_auto] gap-2 mt-2">
        <button disabled={submitting !== null} onClick={() => submit("quick")} className="py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0">
          {submitting === "quick" ? "추가 중..." : "추가"}
        </button>
        <button disabled={submitting !== null} onClick={() => submit("details")} className="py-1.5 bg-white hover:bg-indigo-50 text-indigo-600 text-xs font-semibold rounded-xl border border-indigo-200 hover:border-indigo-300 shadow-sm hover:shadow hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0">
          {submitting === "details" ? "여는 중..." : "세부사항 추가"}
        </button>
        <button disabled={submitting !== null} onClick={onCancel} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0">취소</button>
      </div>
    </div>
  );
}

function ColumnHeader({ column, projectId, dragHandleProps, onRename, onDelete }: {
  column: Column; projectId: string; dragHandleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>; onRename: (name: string) => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(column.name);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commit = async () => {
    const name = value.trim();
    if (name && name !== column.name) {
      try {
        await apiFetch(`/api/projects/${projectId}/columns/${column.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
      } catch {
      }
      onRename(name);
    } else { setValue(column.name); }
    setEditing(false);
  };

  const handleDelete = async () => {
    if (column.tasks.length > 0 && !confirm(`'${column.name}' 컬럼과 카드 ${column.tasks.length}개를 삭제하시겠습니까?`)) return;
    try {
      await apiFetch(`/api/projects/${projectId}/columns/${column.id}`, { method: "DELETE" });
    } catch {
    }
    onDelete();
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 group/hdr">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {editing ? (
          <input ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setValue(column.name); setEditing(false); } }}
            onBlur={commit}
            className="text-sm font-semibold text-gray-700 bg-white border border-indigo-300 rounded-lg px-2 py-0.5 outline-none ring-1 ring-indigo-200 w-full" />
        ) : (
          <>
            <button type="button" {...dragHandleProps} onClick={(e) => e.stopPropagation()} title="컬럼 이동" className="w-8 h-8 -my-1.5 -ml-1.5 flex items-center justify-center rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-grab active:cursor-grabbing touch-none select-none flex-shrink-0 transition-colors">
              <GripVertical size={16} />
            </button>
            <h3 className="text-sm font-semibold text-gray-700 truncate cursor-pointer hover:text-indigo-600 transition-colors select-none" onClick={() => setEditing(true)} title="클릭하여 이름 변경">{column.name}</h3>
            <span className="text-xs text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">{column.tasks.length}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
        {editing ? (
          <>
            <button onClick={commit} className="w-5 h-5 flex items-center justify-center text-indigo-600 hover:bg-indigo-50 rounded transition-colors"><Check size={12} /></button>
            <button onClick={() => { setValue(column.name); setEditing(false); }} className="w-5 h-5 flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded transition-colors"><XIcon size={12} /></button>
          </>
        ) : (
          <>
            <button onClick={() => setEditing(true)} className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-300 hover:text-indigo-600 hover:bg-indigo-50 transition-colors opacity-0 group-hover/hdr:opacity-100"><Pencil size={11} /></button>
            <button onClick={handleDelete} className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-300 hover:text-rose-500 hover:bg-rose-50 transition-colors opacity-0 group-hover/hdr:opacity-100"><Trash2 size={11} /></button>
          </>
        )}
      </div>
    </div>
  );
}

function SortableColumnContainer({ column, children }: {
  column: Column;
  children: (props: { dragHandleProps: React.ButtonHTMLAttributes<HTMLButtonElement>; isDragging: boolean }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: columnDragId(column.id),
    data: { type: "column", columnId: column.id },
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const dragHandleProps = { ...attributes, ...listeners } as React.ButtonHTMLAttributes<HTMLButtonElement>;

  return (
    <div ref={setNodeRef} style={style} className={`flex-shrink-0 w-[calc(100vw-2.5rem)] md:w-[300px] flex flex-col snap-center select-none ${isDragging ? "opacity-60" : ""}`}>
      {children({ dragHandleProps, isDragging })}
    </div>
  );
}

export default function KanbanBoard({ projectId }: Props) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<{ task: Task; colId: string } | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColName, setNewColName] = useState("");
  const newColRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } })
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await apiFetch(`/api/projects/${projectId}`);
        if (!res.ok) throw new Error("Kanban board request failed");
        const data = await res.json();
        if (cancelled) return;
        setColumns(data.columns ?? []);
        setMembers((data.members ?? []).map((m: { user: Member }) => m.user));
      } catch {
        if (!cancelled) setLoadError("칸반 데이터를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, reloadKey]);

  useEffect(() => { if (addingColumn) newColRef.current?.focus(); }, [addingColumn]);

  const handleDragStart = (e: DragStartEvent) => {
    if (e.active.data.current?.type === "column") {
      setActiveTask(null);
      return;
    }
    const task = columns.flatMap((c) => c.tasks).find((t) => t.id === e.active.id);
    setActiveTask(task ?? null);
  };

  const handleDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    if (active.data.current?.type === "column") return;
    const activeTaskId = active.id as string;
    const overId = over.id as string;
    const activeCol = columns.find((c) => c.tasks.some((t) => t.id === activeTaskId));
    const overColumnId = over.data.current?.type === "column" ? over.data.current.columnId as string : getColumnIdFromDragId(overId);
    const overCol = columns.find((c) => c.tasks.some((t) => t.id === overId)) ?? columns.find((c) => c.id === overColumnId);
    if (!activeCol || !overCol || activeCol.id === overCol.id) return;
    setColumns((prev) => prev.map((col) => {
      if (col.id === activeCol.id) return { ...col, tasks: col.tasks.filter((t) => t.id !== activeTaskId) };
      if (col.id === overCol.id) { const task = activeCol.tasks.find((t) => t.id === activeTaskId)!; return { ...col, tasks: [...col.tasks, { ...task, columnId: col.id }] }; }
      return col;
    }));
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = e;
    if (!over) return;

    if (active.data.current?.type === "column") {
      const activeColumnId = active.data.current.columnId as string;
      const overColumnId = over.data.current?.type === "column"
        ? over.data.current.columnId as string
        : getColumnIdFromDragId(over.id as string);
      if (activeColumnId === overColumnId) return;

      const sorted = [...columns].sort((a, b) => a.order - b.order);
      const oldIndex = sorted.findIndex((c) => c.id === activeColumnId);
      const newIndex = sorted.findIndex((c) => c.id === overColumnId);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(sorted, oldIndex, newIndex).map((column, order) => ({ ...column, order }));
      setColumns(reordered);
      await Promise.all(reordered.map((column) =>
        apiFetch(`/api/projects/${projectId}/columns/${column.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: column.order }),
        })
      ));
      return;
    }

    const activeTaskId = active.id as string;
    const overId = over.id as string;
    const col = columns.find((c) => c.tasks.some((t) => t.id === activeTaskId));
    if (!col) return;

    const oldIndex = col.tasks.findIndex((t) => t.id === activeTaskId);
    const newIndex = col.tasks.findIndex((t) => t.id === overId);

    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
      const reordered = arrayMove(col.tasks, oldIndex, newIndex);
      setColumns((prev) => prev.map((c) => c.id === col.id ? { ...c, tasks: reordered } : c));
      await Promise.all(reordered.map((t, i) =>
        apiFetch(`/api/projects/${projectId}/tasks/${t.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: i, columnId: col.id }),
        })
      ));
    } else {
      const task = col.tasks.find((t) => t.id === activeTaskId);
      if (task) {
        await apiFetch(`/api/projects/${projectId}/tasks/${task.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ columnId: task.columnId }),
        });
      }
    }
  };

  const addTask = async (columnId: string, title: string, openDetails = false) => {
    try {
      const res = await apiFetch(`/api/projects/${projectId}/tasks`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, columnId }),
      });
      if (res.ok) {
        const task = await res.json();
        setColumns((prev) => prev.map((c) => c.id === columnId ? { ...c, tasks: [...c.tasks, task] } : c));
        if (openDetails) setSelectedTask({ task, colId: columnId });
        setAddingTo(null);
        return true;
      }
    } catch {
    }
    return false;
  };

  const deleteTask = async (taskId: string, columnId: string) => {
    try {
      await apiFetch(`/api/projects/${projectId}/tasks/${taskId}`, { method: "DELETE" });
    } catch {
    }
    setColumns((prev) => prev.map((c) => c.id === columnId ? { ...c, tasks: c.tasks.filter((t) => t.id !== taskId) } : c));
    if (selectedTask?.task.id === taskId) setSelectedTask(null);
  };

  const moveTask = async (taskId: string, fromColId: string, direction: -1 | 1) => {
    const sorted = [...columns].sort((a, b) => a.order - b.order);
    const fromIdx = sorted.findIndex((c) => c.id === fromColId);
    const toIdx = fromIdx + direction;
    if (toIdx < 0 || toIdx >= sorted.length) return;
    const toCol = sorted[toIdx];
    const task = columns.flatMap((c) => c.tasks).find((t) => t.id === taskId);
    if (!task) return;
    setColumns((prev) => prev.map((col) => {
      if (col.id === fromColId) return { ...col, tasks: col.tasks.filter((t) => t.id !== taskId) };
      if (col.id === toCol.id) return { ...col, tasks: [...col.tasks, { ...task, columnId: toCol.id }] };
      return col;
    }));
    try {
      await apiFetch(`/api/projects/${projectId}/tasks/${taskId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columnId: toCol.id }),
      });
    } catch {
    }
  };

  const addColumn = async () => {
    const name = newColName.trim();
    if (!name) { setAddingColumn(false); return; }
    try {
      const res = await apiFetch(`/api/projects/${projectId}/columns`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const col = await res.json();
        setColumns((prev) => [...prev, { ...col, tasks: [] }]);
      }
    } catch {
    }
    setNewColName(""); setAddingColumn(false);
  };

  if (loading) return (
    <div className="flex gap-3 md:gap-4 h-full overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth">
      {[
        { cards: 3, w: "2/3" },
        { cards: 2, w: "1/2" },
        { cards: 4, w: "3/4" },
      ].map((col, i) => (
        <div key={i} className="flex-shrink-0 w-[calc(100vw-2.5rem)] md:w-[300px] flex flex-col snap-center">
          <div className="flex-1 flex flex-col bg-gray-50/80 rounded-2xl border border-gray-200 border-t-4 border-t-gray-200 overflow-hidden">
            {/* column header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-20 rounded-lg" />
                <Skeleton className="h-4 w-6 rounded-full" />
              </div>
              <Skeleton className="w-6 h-6 rounded-lg" />
            </div>
            {/* cards */}
            <div className="flex-1 px-3 py-3 space-y-2">
              {[...Array(col.cards)].map((_, j) => (
                <div key={j} className="bg-white rounded-xl border border-gray-100 p-3.5 space-y-2">
                  <Skeleton className={`h-4 w-${col.w} rounded-lg`} />
                  <Skeleton className="h-3 w-full rounded" />
                  <div className="flex gap-1.5 mt-1">
                    <Skeleton className="h-5 w-12 rounded-md" />
                    <Skeleton className="h-5 w-16 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  if (loadError) return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <AlertCircle size={28} className="mb-3 text-rose-400" />
      <p className="font-medium text-gray-700">{loadError}</p>
      <button
        type="button"
        onClick={() => setReloadKey((current) => current + 1)}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
      >
        <RotateCw size={14} />
        다시 시도
      </button>
    </div>
  );

  const sortedCols = [...columns].sort((a, b) => a.order - b.order);

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 md:gap-4 h-full overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth select-none">
          <SortableContext items={sortedCols.map((column) => columnDragId(column.id))} strategy={horizontalListSortingStrategy}>
            {sortedCols.map((column, colIdx) => {
              const prevCol = sortedCols[colIdx - 1];
              const nextCol = sortedCols[colIdx + 1];
              return (
                <SortableColumnContainer key={column.id} column={column}>
                  {({ dragHandleProps }) => (
                <div className={`flex-1 flex flex-col bg-gray-50/80 rounded-2xl border border-gray-200 border-t-4 ${COLUMN_COLORS[colIdx % COLUMN_COLORS.length]} overflow-hidden`}>
                  <ColumnHeader column={column} projectId={projectId} dragHandleProps={dragHandleProps}
                    onRename={(name) => setColumns((prev) => prev.map((c) => c.id === column.id ? { ...c, name } : c))}
                    onDelete={() => setColumns((prev) => prev.filter((c) => c.id !== column.id))}
                  />
                  <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-[120px]"
                    onClick={(e) => { if (e.target === e.currentTarget && addingTo !== column.id) setAddingTo(column.id); }}>
                    <SortableContext items={column.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                      {column.tasks.map((task) => (
                        <TaskCard key={task.id} task={task}
                          canMoveLeft={!!prevCol} canMoveRight={!!nextCol}
                          prevColName={prevCol?.name ?? ""} nextColName={nextCol?.name ?? ""}
                          onDelete={() => deleteTask(task.id, column.id)}
                          onMoveLeft={() => moveTask(task.id, column.id, -1)}
                          onMoveRight={() => moveTask(task.id, column.id, 1)}
                          onClick={() => setSelectedTask({ task, colId: column.id })}
                        />
                      ))}
                    </SortableContext>
                    {addingTo === column.id && (
                      <AddTaskInline
                        onAdd={(title) => addTask(column.id, title)}
                        onAddDetails={(title) => addTask(column.id, title, true)}
                        onCancel={() => setAddingTo(null)}
                      />
                    )}
                    {column.tasks.length === 0 && addingTo !== column.id && (
                      <button onClick={() => setAddingTo(column.id)} className="w-full py-8 flex flex-col items-center gap-2 text-gray-300 hover:text-indigo-400 hover:bg-indigo-50/50 rounded-xl border-2 border-dashed border-gray-200 hover:border-indigo-200 transition-all">
                        <Plus size={20} /><span className="text-xs font-medium">클릭해서 추가</span>
                      </button>
                    )}
                  </div>
                  {addingTo !== column.id && column.tasks.length > 0 && (
                    <div className="px-3 pb-3">
                      <button onClick={() => setAddingTo(column.id)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:text-indigo-600 hover:bg-white rounded-xl transition-colors border border-transparent hover:border-gray-200">
                        <Plus size={13} />카드 추가
                      </button>
                    </div>
                  )}
                </div>
                  )}
                </SortableColumnContainer>
              );
            })}
          </SortableContext>

          {/* Add column */}
          <div className="flex-shrink-0 w-72 md:w-[300px] snap-center">
            {addingColumn ? (
              <div className="bg-gray-50/80 rounded-2xl border border-gray-200 border-t-4 border-t-gray-300 p-3">
                <input ref={newColRef} value={newColName} onChange={(e) => setNewColName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addColumn(); if (e.key === "Escape") { setAddingColumn(false); setNewColName(""); } }}
                  placeholder="컬럼 이름..." className="w-full text-sm font-semibold text-gray-700 bg-white border border-indigo-300 rounded-xl px-3 py-2 outline-none ring-1 ring-indigo-200 mb-2" />
                <div className="flex gap-2">
                  <button onClick={addColumn} className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">추가</button>
                  <button onClick={() => { setAddingColumn(false); setNewColName(""); }} className="flex-1 py-1.5 bg-gray-100 text-gray-700 text-xs rounded-xl hover:bg-gray-200 hover:-translate-y-0.5 transition-all">취소</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingColumn(true)} className="w-full h-16 flex items-center justify-center gap-2 text-gray-400 hover:text-indigo-600 bg-gray-50/80 hover:bg-indigo-50/60 rounded-2xl border-2 border-dashed border-gray-200 hover:border-indigo-300 transition-all text-sm font-medium">
                <Plus size={16} />컬럼 추가
              </button>
            )}
          </div>
        </div>

        <DragOverlay>
          {activeTask && (
            <div className="rotate-1 opacity-95 w-[300px]">
              <TaskCard task={activeTask} onDelete={() => {}} onMoveLeft={() => {}} onMoveRight={() => {}} canMoveLeft={false} canMoveRight={false} prevColName="" nextColName="" onClick={() => {}} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask.task}
          projectId={projectId}
          members={members}
          onClose={() => setSelectedTask(null)}
          onUpdate={(updated) => {
            setColumns((prev) => prev.map((c) => c.id === selectedTask.colId ? { ...c, tasks: c.tasks.map((t) => t.id === updated.id ? updated : t) } : c));
            setSelectedTask((prev) => prev ? { ...prev, task: updated } : null);
          }}
          onDelete={() => { deleteTask(selectedTask.task.id, selectedTask.colId); setSelectedTask(null); }}
        />
      )}
    </>
  );
}
