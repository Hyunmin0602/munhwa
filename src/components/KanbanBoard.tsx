"use client";
import { useState, useEffect, useRef } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  type CollisionDetection,
  pointerWithin,
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
import { apiFetch, showToast } from "@/lib/client-fetch";
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
  integratedStatus: "BEFORE" | "IN_PROGRESS" | "DONE" | null;
  isIntegratedPrimary: boolean;
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
  "bg-slate-500",
  "bg-indigo-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-violet-500",
];

const columnDragId = (columnId: string) => `column:${columnId}`;
const getColumnIdFromDragId = (id: string) => id.startsWith("column:") ? id.slice("column:".length) : id;
const pointerFirstCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
};
const INTEGRATED_STATUS_OPTIONS = [
  { value: "", label: "통합 화면에 표시하지 않음" },
  { value: "BEFORE", label: "진행 전" },
  { value: "IN_PROGRESS", label: "진행 중" },
  { value: "DONE", label: "진행 완료" },
] as const;

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
        className={`bg-white border border-slate-200 shadow-sm group rounded-xl cursor-grab active:cursor-grabbing touch-none ${!isSortDragging ? "hover:-translate-y-0.5 hover:shadow-md hover:border-indigo-200" : ""}`}
      >
        <div className="p-3.5">
          <div className="flex items-start gap-2">
            <button type="button" tabIndex={-1} onClick={(e) => e.stopPropagation()} className="mt-0.5 text-gray-300 group-hover:text-gray-400 flex-shrink-0 pointer-events-none" aria-hidden="true">
              <GripVertical size={14} />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2 mb-2">{task.title}</p>
              {task.description && <p className="text-xs text-slate-400 line-clamp-2 mb-2 leading-relaxed">{task.description}</p>}
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

function ColumnHeader({ column, projectId, visibleTaskCount, accentClass, dragHandleProps, onRename, onMapping, onDelete }: {
  column: Column; projectId: string; visibleTaskCount: number; accentClass: string; dragHandleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>; onRename: (name: string) => void; onMapping: (column: Column) => void; onDelete: () => void;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [settingsName, setSettingsName] = useState(column.name);
  const [settingsStatus, setSettingsStatus] = useState(column.integratedStatus ?? "");
  const [settingsError, setSettingsError] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  const openSettings = () => {
    setSettingsName(column.name);
    setSettingsStatus(column.integratedStatus ?? "");
    setSettingsError("");
    setShowSettings(true);
  };

  const handleDelete = async () => {
    if (column.tasks.length > 0 && !confirm(`'${column.name}' 컬럼과 카드 ${column.tasks.length}개를 삭제하시겠습니까?`)) return;
    try {
      await apiFetch(`/api/projects/${projectId}/columns/${column.id}`, { method: "DELETE" });
    } catch {
    }
    onDelete();
  };

  const saveSettings = async () => {
    const name = settingsName.trim();
    if (!name) {
      setSettingsError("칸반 열 이름을 입력하세요.");
      return;
    }

    setSavingSettings(true);
    setSettingsError("");
    try {
      const response = await apiFetch(`/api/projects/${projectId}/columns/${column.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, integratedStatus: settingsStatus || null, isIntegratedPrimary: !!settingsStatus }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        setSettingsError(payload?.error ?? "열 설정을 저장하지 못했습니다.");
        return;
      }
      const updated = await response.json() as Column;
      if (name !== column.name) onRename(name);
      onMapping(updated);
      setShowSettings(false);
    } catch {
      setSettingsError("서버와 연결할 수 없습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 group/hdr">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <>
          <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${accentClass}`} />
          <button type="button" {...dragHandleProps} onClick={(e) => e.stopPropagation()} title="컬럼 이동" className="w-8 h-8 -my-1.5 -ml-1.5 flex items-center justify-center rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-grab active:cursor-grabbing touch-none select-none flex-shrink-0 transition-colors">
            <GripVertical size={16} />
          </button>
          <h3 className="text-sm font-bold text-slate-800 truncate">{column.name}</h3>
          <span className="text-xs text-slate-500 bg-white px-1.5 py-0.5 rounded-full font-medium ring-1 ring-slate-200 flex-shrink-0">{visibleTaskCount}</span>
        </>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
        <>
          <button onClick={openSettings} className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-300 hover:text-indigo-600 hover:bg-indigo-50 transition-colors opacity-0 group-hover/hdr:opacity-100" title="열 설정"><Pencil size={11} /></button>
          <button onClick={handleDelete} className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-300 hover:text-rose-500 hover:bg-rose-50 transition-colors opacity-0 group-hover/hdr:opacity-100"><Trash2 size={11} /></button>
        </>
      </div>
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowSettings(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold text-indigo-600">KANBAN COLUMN</p><h3 className="mt-1 text-lg font-bold text-slate-900">{column.name} 설정</h3></div><button type="button" onClick={() => setShowSettings(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><XIcon size={16} /></button></div>
            <label className="mt-5 block text-xs font-semibold text-slate-500">칸반 열 이름
              <input value={settingsName} onChange={(event) => setSettingsName(event.target.value)} maxLength={100} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-200" />
            </label>
            <label className="mt-4 block text-xs font-semibold text-slate-500">통합 칸반 상태
              <select value={settingsStatus} onChange={(event) => setSettingsStatus(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-200">
                <option value="">통합 화면에 표시하지 않음</option>
                <option value="BEFORE">진행 전</option>
                <option value="IN_PROGRESS">진행 중</option>
                <option value="DONE">진행 완료</option>
              </select>
            </label>
            <p className="mt-2 text-xs leading-5 text-slate-400">상태를 선택하면 이 열은 해당 상태의 대표 열이 됩니다. 통합 화면에서 카드를 이동할 때 이 열로 저장됩니다.</p>
            {settingsError && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{settingsError}</p>}
            <div className="mt-5 flex gap-2"><button type="button" onClick={() => setShowSettings(false)} disabled={savingSettings} className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-50">취소</button><button type="button" onClick={saveSettings} disabled={savingSettings} className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">{savingSettings ? "저장 중…" : "저장"}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function SortableColumnContainer({ column, mobileVisible, children }: {
  column: Column;
  mobileVisible: boolean;
  children: (props: { dragHandleProps: React.ButtonHTMLAttributes<HTMLButtonElement>; isDragging: boolean }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: columnDragId(column.id),
    data: { type: "column", columnId: column.id },
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const dragHandleProps = { ...attributes, ...listeners } as React.ButtonHTMLAttributes<HTMLButtonElement>;

  return (
    <div ref={setNodeRef} style={style} className={`flex-shrink-0 w-full md:w-[300px] flex flex-col snap-center select-none ${mobileVisible ? "" : "hidden md:flex"} ${isDragging ? "opacity-60" : ""}`}>
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
  const [activeColumnIndex, setActiveColumnIndex] = useState(0);
  const [showIntegratedSetup, setShowIntegratedSetup] = useState(false);
  const [integratedSetup, setIntegratedSetup] = useState<Record<string, string>>({});
  const [savingIntegratedSetup, setSavingIntegratedSetup] = useState(false);
  const [integratedSetupError, setIntegratedSetupError] = useState("");
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
        const loadedColumns = data.columns ?? [];
        setColumns(loadedColumns);
        setMembers((data.members ?? []).map((m: { user: Member }) => m.user));
        if (loadedColumns.length > 0 && !loadedColumns.some((column: Column) => column.integratedStatus)) {
          setIntegratedSetup(Object.fromEntries(loadedColumns.map((column: Column) => [column.id, ""])));
          setShowIntegratedSetup(true);
        }
      } catch {
        if (!cancelled) setLoadError("칸반 데이터를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, reloadKey]);

  useEffect(() => { if (addingColumn) newColRef.current?.focus(); }, [addingColumn]);

  const saveIntegratedSetup = async () => {
    const mappedColumns = columns.filter((column) => integratedSetup[column.id]);
    if (!mappedColumns.length) {
      setIntegratedSetupError("통합 화면에 표시할 열을 하나 이상 선택하세요.");
      return;
    }

    setSavingIntegratedSetup(true);
    setIntegratedSetupError("");
    try {
      for (const column of mappedColumns) {
        const response = await apiFetch(`/api/projects/${projectId}/columns/${column.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ integratedStatus: integratedSetup[column.id], isIntegratedPrimary: true }),
        });
        if (!response.ok) throw new Error("Integrated Kanban setup failed");
      }

      setColumns((previous) => previous.map((column) => {
        const integratedStatus = integratedSetup[column.id] || null;
        const isIntegratedPrimary = integratedStatus !== null && !mappedColumns.some((other) => other.order > column.order && integratedSetup[other.id] === integratedStatus);
        return { ...column, integratedStatus: integratedStatus as Column["integratedStatus"], isIntegratedPrimary };
      }));
      setShowIntegratedSetup(false);
    } catch {
      setIntegratedSetupError("통합 칸반 열 설정을 저장하지 못했습니다. 다시 시도하세요.");
    } finally {
      setSavingIntegratedSetup(false);
    }
  };

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
      const response = await apiFetch(`/api/projects/${projectId}/tasks/${taskId}`, { method: "DELETE" }, { showGlobalError: false });
      if (!response.ok) throw new Error("Task delete request failed");
    } catch {
      showToast("카드를 삭제하지 못했습니다. 다시 시도해주세요.");
      return false;
    }
    setColumns((prev) => prev.map((c) => c.id === columnId ? { ...c, tasks: c.tasks.filter((t) => t.id !== taskId) } : c));
    if (selectedTask?.task.id === taskId) setSelectedTask(null);
    return true;
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
      <DndContext sensors={sensors} collisionDetection={pointerFirstCollisionDetection} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        {sortedCols.length > 0 && (
          <div className="mb-3 flex items-center justify-between md:hidden">
            <span className="text-xs font-medium text-gray-500">컬럼 {activeColumnIndex + 1} / {sortedCols.length}</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setActiveColumnIndex((index) => index - 1)} disabled={activeColumnIndex === 0} className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 disabled:opacity-30" aria-label="이전 컬럼"><ChevronLeft size={16} /></button>
              <button type="button" onClick={() => setActiveColumnIndex((index) => index + 1)} disabled={activeColumnIndex === sortedCols.length - 1} className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 disabled:opacity-30" aria-label="다음 컬럼"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
        <div className="flex h-full flex-col gap-3 overflow-y-auto pb-2 select-none md:flex-row md:gap-4 md:overflow-x-auto md:snap-x md:snap-mandatory md:scroll-smooth">
          <SortableContext items={sortedCols.map((column) => columnDragId(column.id))} strategy={horizontalListSortingStrategy}>
            {sortedCols.map((column, colIdx) => {
              const prevCol = sortedCols[colIdx - 1];
              const nextCol = sortedCols[colIdx + 1];
              const visibleTasks = column.tasks;
              return (
                <SortableColumnContainer key={column.id} column={column} mobileVisible={colIdx === activeColumnIndex}>
                  {({ dragHandleProps }) => (
                <div className="flex-1 flex flex-col bg-slate-100/70 rounded-2xl border border-slate-200 overflow-hidden">
                  <ColumnHeader column={column} projectId={projectId} visibleTaskCount={visibleTasks.length} accentClass={COLUMN_COLORS[colIdx % COLUMN_COLORS.length]} dragHandleProps={dragHandleProps}
                    onRename={(name) => setColumns((prev) => prev.map((c) => c.id === column.id ? { ...c, name } : c))}
                    onMapping={(updated) => setColumns((prev) => prev.map((c) => {
                      if (c.id === updated.id) return { ...c, ...updated, tasks: c.tasks };
                      if (updated.isIntegratedPrimary && c.integratedStatus === updated.integratedStatus) return { ...c, isIntegratedPrimary: false };
                      return c;
                    }))}
                    onDelete={() => {
                      setColumns((prev) => prev.filter((c) => c.id !== column.id));
                      setActiveColumnIndex((index) => Math.max(0, Math.min(index, sortedCols.length - 2)));
                    }}
                  />
                  <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-[120px]"
                    onClick={(e) => { if (e.target === e.currentTarget && addingTo !== column.id) setAddingTo(column.id); }}>
                    <SortableContext items={visibleTasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
                      {visibleTasks.map((task) => (
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
                    {visibleTasks.length === 0 && addingTo !== column.id && (
                      <button onClick={() => setAddingTo(column.id)} className="w-full py-8 flex flex-col items-center gap-2 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl border-2 border-dashed border-slate-200 hover:border-indigo-200 transition-all">
                        <Plus size={20} /><span className="text-xs font-medium">이 기간의 카드 없음 · 클릭해 추가</span>
                      </button>
                    )}
                  </div>
                  {addingTo !== column.id && visibleTasks.length > 0 && (
                    <div className="px-3 pb-3">
                      <button onClick={() => setAddingTo(column.id)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl transition-colors border border-transparent hover:border-slate-200">
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
          <div className="flex-shrink-0 w-full md:w-[300px] md:snap-center">
            {addingColumn ? (
              <div className="bg-slate-100/70 rounded-2xl border border-slate-200 p-3">
                <input ref={newColRef} value={newColName} onChange={(e) => setNewColName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addColumn(); if (e.key === "Escape") { setAddingColumn(false); setNewColName(""); } }}
                  placeholder="컬럼 이름..." className="w-full text-sm font-semibold text-gray-700 bg-white border border-indigo-300 rounded-xl px-3 py-2 outline-none ring-1 ring-indigo-200 mb-2" />
                <div className="flex gap-2">
                  <button onClick={addColumn} className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">추가</button>
                  <button onClick={() => { setAddingColumn(false); setNewColName(""); }} className="flex-1 py-1.5 bg-gray-100 text-gray-700 text-xs rounded-xl hover:bg-gray-200 hover:-translate-y-0.5 transition-all">취소</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingColumn(true)} className="w-full h-16 flex items-center justify-center gap-2 text-slate-400 hover:text-indigo-600 bg-slate-100/70 hover:bg-white rounded-2xl border-2 border-dashed border-slate-200 hover:border-indigo-300 transition-all text-sm font-medium">
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

      {showIntegratedSetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <p className="text-xs font-semibold text-indigo-600">INTEGRATED KANBAN SETUP</p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">통합 칸반에 표시할 열을 설정하세요</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">이 사업의 열이 아직 통합 화면에 연결되지 않았습니다. 각 열의 공통 상태를 선택하면 통합 칸반에서 카드 진행 상황을 확인하고 이동할 수 있습니다.</p>
            <div className="mt-5 space-y-3">
              {sortedCols.map((column) => (
                <label key={column.id} className="grid grid-cols-[minmax(0,1fr)_11rem] items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                  <span className="truncate font-semibold text-slate-700">{column.name}</span>
                  <select value={integratedSetup[column.id] ?? ""} onChange={(event) => setIntegratedSetup((previous) => ({ ...previous, [column.id]: event.target.value }))} disabled={savingIntegratedSetup} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-200 disabled:opacity-60">
                    {INTEGRATED_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              ))}
            </div>
            {integratedSetupError && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{integratedSetupError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowIntegratedSetup(false)} disabled={savingIntegratedSetup} className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-50">나중에 설정</button>
              <button type="button" onClick={saveIntegratedSetup} disabled={savingIntegratedSetup} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">{savingIntegratedSetup ? "저장 중…" : "통합 칸반에 등록"}</button>
            </div>
          </div>
        </div>
      )}

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
          onDelete={() => deleteTask(selectedTask.task.id, selectedTask.colId)}
        />
      )}
    </>
  );
}
