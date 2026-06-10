"use client";
import { useState, useEffect, useRef } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus, Trash2, Calendar, User, GripVertical,
  ChevronLeft, ChevronRight, Pencil, Check, X as XIcon,
} from "lucide-react";
import TaskDetailModal from "./TaskDetailModal";

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

function TaskCard({
  task, onDelete, onMoveLeft, onMoveRight,
  canMoveLeft, canMoveRight, prevColName, nextColName, onClick,
}: {
  task: Task; onDelete: () => void; onMoveLeft: () => void; onMoveRight: () => void;
  canMoveLeft: boolean; canMoveRight: boolean; prevColName: string; nextColName: string;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortDragging } = useSortable({ id: task.id });
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
    <div ref={setNodeRef} style={style} className={`relative rounded-xl overflow-hidden ${isSortDragging ? "opacity-40 scale-95" : ""}`}>
      <div className={`absolute inset-y-0 left-0 flex items-center justify-start px-3 rounded-l-xl pointer-events-none bg-indigo-500 text-white text-xs font-semibold gap-1 transition-all duration-100 ${showLeft ? "opacity-100 w-20" : "opacity-0 w-0"}`}>
        <ChevronLeft size={14} /><span className="truncate">{prevColName}</span>
      </div>
      <div className={`absolute inset-y-0 right-0 flex items-center justify-end px-3 rounded-r-xl pointer-events-none bg-emerald-500 text-white text-xs font-semibold gap-1 transition-all duration-100 ${showRight ? "opacity-100 w-20" : "opacity-0 w-0"}`}>
        <span className="truncate">{nextColName}</span><ChevronRight size={14} />
      </div>
      <div
        style={{ transform: `translateX(${swipeDx}px)`, transition: swiping ? "none" : "transform 0.2s ease" }}
        onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
        onClick={() => { if (!didSwipe.current) onClick(); }}
        className={`bg-white border border-gray-150 shadow-sm group rounded-xl cursor-pointer ${!isSortDragging ? "hover:shadow-md hover:border-indigo-200" : ""}`}
      >
        <div className="p-3.5">
          <div className="flex items-start gap-2">
            <button {...attributes} {...listeners} onClick={(e) => e.stopPropagation()} className="mt-0.5 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing flex-shrink-0 touch-none">
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

function AddTaskInline({ onAdd, onCancel }: { onAdd: (t: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const submit = () => { if (title.trim()) onAdd(title.trim()); else onCancel(); };
  return (
    <div className="bg-white rounded-xl border border-indigo-300 shadow-sm ring-1 ring-indigo-200 p-3">
      <textarea ref={ref} value={title} onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } if (e.key === "Escape") onCancel(); }}
        placeholder="태스크 제목 입력 후 Enter..." rows={2}
        className="w-full text-sm text-gray-800 resize-none outline-none placeholder-gray-300" />
      <div className="flex gap-2 mt-2">
        <button onClick={submit} className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors">추가</button>
        <button onClick={onCancel} className="flex-1 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs rounded-lg transition-colors">취소</button>
      </div>
    </div>
  );
}

function ColumnHeader({ column, projectId, onRename, onDelete }: {
  column: Column; projectId: string; onRename: (name: string) => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(column.name);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commit = async () => {
    const name = value.trim();
    if (name && name !== column.name) {
      await fetch(`/api/projects/${projectId}/columns/${column.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      onRename(name);
    } else { setValue(column.name); }
    setEditing(false);
  };

  const handleDelete = async () => {
    if (column.tasks.length > 0 && !confirm(`'${column.name}' 컬럼과 카드 ${column.tasks.length}개를 삭제하시겠습니까?`)) return;
    await fetch(`/api/projects/${projectId}/columns/${column.id}`, { method: "DELETE" });
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
            <h3 className="text-sm font-semibold text-gray-700 truncate cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => setEditing(true)} title="클릭하여 이름 변경">{column.name}</h3>
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

export default function KanbanBoard({ projectId }: Props) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<{ task: Task; colId: string } | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColName, setNewColName] = useState("");
  const newColRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        setColumns(data.columns ?? []);
        setMembers((data.members ?? []).map((m: { user: Member }) => m.user));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { if (addingColumn) newColRef.current?.focus(); }, [addingColumn]);

  const handleDragStart = (e: DragStartEvent) => {
    const task = columns.flatMap((c) => c.tasks).find((t) => t.id === e.active.id);
    setActiveTask(task ?? null);
  };

  const handleDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeTaskId = active.id as string;
    const overId = over.id as string;
    const activeCol = columns.find((c) => c.tasks.some((t) => t.id === activeTaskId));
    const overCol = columns.find((c) => c.tasks.some((t) => t.id === overId)) ?? columns.find((c) => c.id === overId);
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
        fetch(`/api/projects/${projectId}/tasks/${t.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: i, columnId: col.id }),
        })
      ));
    } else {
      const task = col.tasks.find((t) => t.id === activeTaskId);
      if (task) {
        await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ columnId: task.columnId }),
        });
      }
    }
  };

  const addTask = async (columnId: string, title: string) => {
    const res = await fetch(`/api/projects/${projectId}/tasks`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, columnId }),
    });
    if (res.ok) {
      const task = await res.json();
      setColumns((prev) => prev.map((c) => c.id === columnId ? { ...c, tasks: [...c.tasks, task] } : c));
    }
    setAddingTo(null);
  };

  const deleteTask = async (taskId: string, columnId: string) => {
    await fetch(`/api/projects/${projectId}/tasks/${taskId}`, { method: "DELETE" });
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
    await fetch(`/api/projects/${projectId}/tasks/${taskId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columnId: toCol.id }),
    });
  };

  const addColumn = async () => {
    const name = newColName.trim();
    if (!name) { setAddingColumn(false); return; }
    const res = await fetch(`/api/projects/${projectId}/columns`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const col = await res.json();
      setColumns((prev) => [...prev, { ...col, tasks: [] }]);
    }
    setNewColName(""); setAddingColumn(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const sortedCols = [...columns].sort((a, b) => a.order - b.order);

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 h-full overflow-x-auto pb-2">
          {sortedCols.map((column, colIdx) => {
            const prevCol = sortedCols[colIdx - 1];
            const nextCol = sortedCols[colIdx + 1];
            return (
              <div key={column.id} className="flex-shrink-0 w-[300px] flex flex-col">
                <div className={`flex-1 flex flex-col bg-gray-50/80 rounded-2xl border border-gray-200 border-t-4 ${COLUMN_COLORS[colIdx % COLUMN_COLORS.length]} overflow-hidden`}>
                  <ColumnHeader column={column} projectId={projectId}
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
                    {addingTo === column.id && <AddTaskInline onAdd={(title) => addTask(column.id, title)} onCancel={() => setAddingTo(null)} />}
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
              </div>
            );
          })}

          {/* Add column */}
          <div className="flex-shrink-0 w-[300px]">
            {addingColumn ? (
              <div className="bg-gray-50/80 rounded-2xl border border-gray-200 border-t-4 border-t-gray-300 p-3">
                <input ref={newColRef} value={newColName} onChange={(e) => setNewColName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addColumn(); if (e.key === "Escape") { setAddingColumn(false); setNewColName(""); } }}
                  placeholder="컬럼 이름..." className="w-full text-sm font-semibold text-gray-700 bg-white border border-indigo-300 rounded-xl px-3 py-2 outline-none ring-1 ring-indigo-200 mb-2" />
                <div className="flex gap-2">
                  <button onClick={addColumn} className="flex-1 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors">추가</button>
                  <button onClick={() => { setAddingColumn(false); setNewColName(""); }} className="flex-1 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200 transition-colors">취소</button>
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
