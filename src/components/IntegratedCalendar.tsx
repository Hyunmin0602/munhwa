"use client";

import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import { apiFetch } from "@/lib/client-fetch";

type Project = { id: string; name: string; color: string };
type CalendarEvent = { id: string; projectId: string; title: string; description: string | null; startDate: string; endDate: string; allDay: boolean; color: string };
type EventForm = { projectId: string; title: string; description: string; startDate: string; endDate: string; allDay: boolean };

const blankForm = (date: dayjs.Dayjs, projectId: string): EventForm => ({ projectId, title: "", description: "", startDate: date.format("YYYY-MM-DDT09:00"), endDate: date.format("YYYY-MM-DDT10:00"), allDay: false });

export default function IntegratedCalendar() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [current, setCurrent] = useState(dayjs());
  const [selectedDay, setSelectedDay] = useState(dayjs());
  const [form, setForm] = useState<EventForm | null>(null);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; date: dayjs.Dayjs } | null>(null);

  const load = async () => {
    setError("");
    try {
      const projectResponse = await apiFetch("/api/projects");
      if (!projectResponse.ok) throw new Error();
      const projectData = await projectResponse.json() as Project[];
      const eventData = await Promise.all(projectData.map(async (project) => {
        const response = await apiFetch(`/api/projects/${project.id}/events`);
        if (!response.ok) throw new Error();
        const items = await response.json() as Omit<CalendarEvent, "projectId">[];
        return items.map((item) => ({ ...item, projectId: project.id }));
      }));
      setProjects(projectData); setEvents(eventData.flat());
    } catch { setError("통합 일정을 불러오지 못했습니다."); }
  };
  useEffect(() => { void load(); }, []);

  const start = current.startOf("month");
  const cells = useMemo(() => {
    const result: Array<dayjs.Dayjs | null> = [...Array(start.day()).fill(null), ...Array.from({ length: current.daysInMonth() }, (_, index) => start.add(index, "day"))];
    while (result.length % 7) result.push(null);
    return result;
  }, [current, start]);
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const eventsForDay = (day: dayjs.Dayjs) => events.filter((event) => !day.startOf("day").isBefore(dayjs(event.startDate).startOf("day")) && !day.startOf("day").isAfter(dayjs(event.endDate).startOf("day")));
  const selectedEvents = eventsForDay(selectedDay);

  const openCreate = (date = selectedDay) => { if (projects.length) { setEditing(null); setForm(blankForm(date, projects[0].id)); } };
  const openEdit = (event: CalendarEvent) => { setEditing(event); setForm({ projectId: event.projectId, title: event.title, description: event.description ?? "", startDate: dayjs(event.startDate).format("YYYY-MM-DDTHH:mm"), endDate: dayjs(event.endDate).format("YYYY-MM-DDTHH:mm"), allDay: event.allDay }); };
  const closeModal = () => { setForm(null); setEditing(null); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form?.title.trim() || !form.projectId) return;
    setSaving(true); setError("");
    try {
      const path = editing ? `/api/projects/${editing.projectId}/events/${editing.id}` : `/api/projects/${form.projectId}/events`;
      const response = await apiFetch(path, { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, title: form.title.trim() }) });
      if (!response.ok) throw new Error();
      const saved = await response.json() as CalendarEvent;
      const next = { ...saved, projectId: editing?.projectId ?? form.projectId };
      setEvents((previous) => editing ? previous.map((item) => item.id === next.id ? next : item) : [...previous, next]);
      closeModal();
    } catch { setError("일정을 저장하지 못했습니다."); } finally { setSaving(false); }
  };
  const remove = async (event: CalendarEvent) => {
    if (!confirm("이 일정을 삭제하시겠습니까?")) return;
    try { const response = await apiFetch(`/api/projects/${event.projectId}/events/${event.id}`, { method: "DELETE" }); if (!response.ok) throw new Error(); setEvents((previous) => previous.filter((item) => item.id !== event.id)); } catch { setError("일정을 삭제하지 못했습니다."); }
  };

  return <div className="mx-auto flex h-full max-w-7xl flex-col gap-4 p-4 md:p-6" onClick={() => setContextMenu(null)}>
    <div className="flex items-center justify-between gap-3"><div><h1 className="text-xl font-bold text-gray-900">통합 일정</h1><p className="text-xs text-gray-400">소속된 모든 사업의 일정을 한 달력에서 관리합니다.</p></div><button type="button" onClick={() => openCreate()} disabled={!projects.length} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Plus size={16} />일정 등록</button></div>
    {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row"><section className="flex min-h-[34rem] flex-1 flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-sm"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><button type="button" onClick={() => setCurrent((value) => value.subtract(1, "month"))} className="rounded-lg p-2 hover:bg-gray-100"><ChevronLeft size={17} /></button><h2 className="w-28 text-center font-bold">{current.format("YYYY년 M월")}</h2><button type="button" onClick={() => setCurrent((value) => value.add(1, "month"))} className="rounded-lg p-2 hover:bg-gray-100"><ChevronRight size={17} /></button></div><button type="button" onClick={() => { setCurrent(dayjs()); setSelectedDay(dayjs()); }} className="rounded-lg border px-3 py-1.5 text-xs">오늘</button></div><div className="grid grid-cols-7 text-center text-xs font-semibold text-gray-400">{["일", "월", "화", "수", "목", "금", "토"].map((name) => <div key={name} className="py-2">{name}</div>)}</div><div className="grid flex-1 grid-cols-7 overflow-hidden rounded-xl border border-gray-100" style={{ gridAutoRows: "minmax(90px, 1fr)" }}>{cells.map((day, index) => <button type="button" key={index} onClick={() => day && setSelectedDay(day)} onContextMenu={(event) => { if (!day) return; event.preventDefault(); setSelectedDay(day); setContextMenu({ x: event.clientX, y: event.clientY, date: day }); }} className={`min-w-0 border-b border-r border-gray-100 p-1 text-left ${day?.isSame(selectedDay, "day") ? "bg-indigo-50" : "hover:bg-gray-50"}`}>{day && <><span className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs ${day.isSame(dayjs(), "day") ? "bg-indigo-600 text-white" : "text-gray-700"}`}>{day.date()}</span><div className="space-y-1">{eventsForDay(day).slice(0, 3).map((item) => <span key={item.id} className="block truncate rounded px-1 py-0.5 text-[10px] text-white" style={{ backgroundColor: projectsById.get(item.projectId)?.color ?? item.color }}>{item.title}</span>)}</div></>}</button>)}</div></section><aside className="w-full rounded-2xl border border-gray-200 bg-white p-4 shadow-sm lg:w-80"><div className="mb-3 flex items-center justify-between"><h2 className="font-bold">{selectedDay.format("M월 D일")} 일정</h2><button type="button" onClick={() => openCreate(selectedDay)} className="rounded-lg p-1.5 text-indigo-600 hover:bg-indigo-50"><Plus size={16} /></button></div><div className="space-y-2">{selectedEvents.map((event) => <div key={event.id} className="rounded-xl border p-3"><p className="text-xs font-medium" style={{ color: projectsById.get(event.projectId)?.color ?? event.color }}>{projectsById.get(event.projectId)?.name}</p><p className="mt-1 font-semibold text-gray-800">{event.title}</p><p className="mt-1 text-xs text-gray-500">{event.allDay ? "종일" : `${dayjs(event.startDate).format("HH:mm")} – ${dayjs(event.endDate).format("HH:mm")}`}</p><div className="mt-2 flex justify-end gap-1"><button type="button" onClick={() => openEdit(event)} className="rounded p-1 text-gray-400 hover:text-indigo-600"><Pencil size={14} /></button><button type="button" onClick={() => void remove(event)} className="rounded p-1 text-gray-400 hover:text-rose-600"><Trash2 size={14} /></button></div></div>)}{selectedEvents.length === 0 && <button type="button" onClick={() => openCreate(selectedDay)} className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed py-10 text-sm text-gray-400 hover:border-indigo-200 hover:text-indigo-600"><CalendarDays size={20} />일정 등록</button>}</div></aside></div>
    {form && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={closeModal}><form onSubmit={save} onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-bold text-gray-900">{editing ? "일정 수정" : "일정 등록"}</h2><p className="mt-0.5 text-xs text-gray-400">{editing ? "변경할 일정 정보를 수정하세요." : "새로운 일정 정보를 입력하세요."}</p></div><button type="button" onClick={closeModal} aria-label="닫기" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X size={18} /></button></div><div className="space-y-4"><label className="block text-xs font-semibold text-gray-600">사업<select value={form.projectId} disabled={!!editing} onChange={(event) => setForm({ ...form, projectId: event.target.value })} className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:text-gray-500">{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label className="block text-xs font-semibold text-gray-600">일정 제목 <span className="text-rose-500">*</span><input autoFocus required maxLength={100} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="일정 제목을 입력하세요" className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" /></label><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-gray-600">시작<input required type="datetime-local" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500" /></label><label className="text-xs font-semibold text-gray-600">종료<input required type="datetime-local" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500" /></label></div><label className="flex items-center gap-2 text-sm font-medium text-gray-700"><input type="checkbox" checked={form.allDay} onChange={(event) => setForm({ ...form, allDay: event.target.checked })} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />종일 일정</label><label className="block text-xs font-semibold text-gray-600">설명 <span className="font-normal text-gray-400">(선택)</span><textarea maxLength={2000} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="일정에 대한 메모를 입력하세요" className="mt-1.5 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" /></label></div><div className="mt-6 flex gap-3"><button type="button" onClick={closeModal} disabled={saving} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">취소</button><button disabled={saving} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? "저장 중…" : <><Check size={15} />저장</>}</button></div></form></div>}
    {contextMenu && <div className="fixed z-50 rounded-xl border border-gray-200 bg-white p-1 shadow-xl" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}><button type="button" onClick={() => { openCreate(contextMenu.date); setContextMenu(null); }} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-indigo-50 hover:text-indigo-700"><Plus size={15} />새 일정</button></div>}
  </div>;
}
