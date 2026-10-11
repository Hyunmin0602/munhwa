"use client";
import { useState, useEffect, type FormEvent } from "react";
import dayjs from "dayjs";
import "dayjs/locale/ko";
import { ChevronLeft, ChevronRight, Plus, X, Clock, CalendarDays, Trash2, Tags, PencilLine, Trash, AlignLeft, List } from "lucide-react";
import { apiFetch } from "@/lib/client-fetch";
import ModalFrame, { ModalCloseButton } from "@/components/ui/ModalFrame";

dayjs.locale("ko");

interface Event {
  id: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  allDay: boolean;
  color: string;
  label: { id: string; name: string; description: string | null; color: string } | null;
}

interface Label {
  id: string;
  name: string;
  description: string | null;
  color: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export default function ScheduleCalendar({ projectId }: { projectId: string }) {
  const [current, setCurrent] = useState(dayjs());
  const [events, setEvents] = useState<Event[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingEventColor, setEditingEventColor] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "", description: "", startDate: "", endDate: "", allDay: false, labelId: "",
  });
  const [labelForm, setLabelForm] = useState({ id: "", name: "", description: "", color: "#6366f1" });
  const [saving, setSaving] = useState(false);
  const [labelSaving, setLabelSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedDay, setSelectedDay] = useState<dayjs.Dayjs | null>(null);
  const [rightPanelMode, setRightPanelMode] = useState<"detailed" | "compact">("detailed");
  const [rightPanelPage, setRightPanelPage] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; date: dayjs.Dayjs } | null>(null);

  useEffect(() => {
    const clearSelectionOutsideCalendar = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest("[data-calendar-surface]")) return;
      setSelectedDay(null);
      setRightPanelPage(0);
      setContextMenu(null);
    };
    document.addEventListener("pointerdown", clearSelectionOutsideCalendar);
    return () => document.removeEventListener("pointerdown", clearSelectionOutsideCalendar);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const [eventRes, labelRes] = await Promise.all([
          apiFetch(`/api/projects/${projectId}/events`),
          apiFetch("/api/event-labels"),
        ]);
        if (!eventRes.ok || !labelRes.ok) throw new Error("일정 조회 실패");
        const eventData = await eventRes.json();
        const labelData = await labelRes.json();
        if (!cancelled) {
          setEvents(Array.isArray(eventData) ? eventData : []);
          setLabels(Array.isArray(labelData) ? labelData : []);
        }
      } catch {
        if (!cancelled) setError("일정을 불러오지 못했습니다.");
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, reloadKey]);

  const startDay = current.startOf("month").day();
  const daysInMonth = current.daysInMonth();
  const startOfMonth = current.startOf("month");

  const cells: (dayjs.Dayjs | null)[] = [
    ...Array(startDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => startOfMonth.add(i, "day")),
  ];
  // pad to complete weeks
  while (cells.length % 7 !== 0) cells.push(null);

  const weekRows = Array.from({ length: cells.length / 7 }, (_, weekIndex) => cells.slice(weekIndex * 7, weekIndex * 7 + 7));

  const eventSegments = weekRows.flatMap((week, weekIndex) => {
    const visibleDays = week.filter(Boolean) as dayjs.Dayjs[];
    if (visibleDays.length === 0) return [];

    const weekStart = visibleDays[0].startOf("day");
    const weekEnd = visibleDays[visibleDays.length - 1].startOf("day");

    const segments = events.flatMap((event) => {
      const eventStart = dayjs(event.startDate).startOf("day");
      const eventEnd = dayjs(event.endDate).startOf("day");
      if (eventEnd.isBefore(weekStart) || eventStart.isAfter(weekEnd)) return [];

      const segmentStart = eventStart.isAfter(weekStart) ? eventStart : weekStart;
      const segmentEnd = eventEnd.isBefore(weekEnd) ? eventEnd : weekEnd;
      const startCol = week.findIndex((day) => day && day.isSame(segmentStart, "day"));
      let endCol = -1;
      for (let index = week.length - 1; index >= 0; index -= 1) {
        const day = week[index];
        if (day && day.isSame(segmentEnd, "day")) {
          endCol = index;
          break;
        }
      }
      if (startCol < 0 || endCol < 0 || endCol < startCol) return [];

      return [{
        event,
        weekIndex,
        startCol,
        endCol,
        isContinuation: !segmentStart.isSame(eventStart, "day"),
      }];
    });

    const laneEnds: number[] = [];
    return segments
      .sort((a, b) => a.startCol - b.startCol || a.endCol - b.endCol)
      .map((segment) => {
        let laneIndex = laneEnds.findIndex((endCol) => segment.startCol > endCol);
        if (laneIndex === -1) {
          laneIndex = laneEnds.length;
          laneEnds.push(segment.endCol);
        } else {
          laneEnds[laneIndex] = segment.endCol;
        }
        return { ...segment, laneIndex };
      });
  });

  const getEventsForDay = (day: dayjs.Dayjs) =>
    events.filter((event) => {
      const eventStart = dayjs(event.startDate).startOf("day");
      const eventEnd = dayjs(event.endDate).startOf("day");
      const targetDay = day.startOf("day");
      return !targetDay.isBefore(eventStart) && !targetDay.isAfter(eventEnd);
    });

  const resetEventForm = () => {
    setShowModal(false);
    setEditingEventId(null);
    setEditingEventColor(null);
  };

  const openModal = (date: dayjs.Dayjs) => {
    const ds = date.format("YYYY-MM-DD");
    setEditingEventId(null);
    setEditingEventColor(null);
    setForm({ title: "", description: "", startDate: ds + "T09:00", endDate: ds + "T10:00", allDay: false, labelId: "" });
    setShowModal(true);
  };

  const openEditModal = (event: Event) => {
    setEditingEventId(event.id);
    setEditingEventColor(event.color);
    setForm({
      title: event.title,
      description: event.description ?? "",
      startDate: dayjs(event.startDate).format("YYYY-MM-DDTHH:mm"),
      endDate: dayjs(event.endDate).format("YYYY-MM-DDTHH:mm"),
      allDay: event.allDay,
      labelId: event.label?.id ?? "",
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(
        editingEventId ? `/api/projects/${projectId}/events/${editingEventId}` : `/api/projects/${projectId}/events`,
        {
        method: editingEventId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          ...(editingEventId ? { color: editingEventColor ?? undefined } : {}),
          labelId: form.labelId || null,
        }),
        }
      );
      if (!res.ok) throw new Error("일정 저장 실패");
      const ev = await res.json();
      setEvents((prev) => editingEventId ? prev.map((item) => item.id === ev.id ? ev : item) : [...prev, ev]);
      resetEventForm();
    } catch {
      setError("일정을 저장하지 못했습니다. 입력 내용을 확인한 뒤 다시 시도해주세요.");
    } finally { setSaving(false); }
  };

  const deleteEvent = async (id: string) => {
    const event = events.find((item) => item.id === id);
    if (!event || !confirm(`'${event.title}' 일정을 삭제하시겠습니까? 삭제 후 되돌릴 수 없습니다.`)) return;
    setError(null);
    try {
      const response = await apiFetch(`/api/projects/${projectId}/events/${id}`, { method: "DELETE" }, { showGlobalError: false });
      if (!response.ok) throw new Error("일정 삭제 실패");
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch {
      setError("일정을 삭제하지 못했습니다. 다시 시도해주세요.");
    }
  };

  const openLabelModal = (label?: Label) => {
    setLabelError(null);
    setLabelForm(label ? { id: label.id, name: label.name, description: label.description ?? "", color: label.color } : { id: "", name: "", description: "", color: "#6366f1" });
    setShowLabelModal(true);
  };

  const saveLabel = async (event: FormEvent) => {
    event.preventDefault();
    if (!labelForm.name.trim()) return;
    setLabelSaving(true);
    setLabelError(null);
    try {
      const response = await apiFetch(labelForm.id ? `/api/event-labels/${labelForm.id}` : "/api/event-labels", {
        method: labelForm.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: labelForm.name.trim(), description: labelForm.description, color: labelForm.color }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "라벨 저장 실패");
      const nextLabel = payload as Label;
      setLabels((current) => labelForm.id ? current.map((item) => item.id === nextLabel.id ? nextLabel : item) : [...current, nextLabel]);
      setShowLabelModal(false);
    } catch (cause) {
      setLabelError(cause instanceof Error ? cause.message : "라벨을 저장하지 못했습니다.");
    } finally {
      setLabelSaving(false);
    }
  };

  const removeLabel = async (label: Label) => {
    if (!confirm(`'${label.name}' 라벨을 삭제하시겠습니까?`)) return;
    setLabelError(null);
    try {
      const response = await apiFetch(`/api/event-labels/${label.id}`, { method: "DELETE" }, { showGlobalError: false });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "라벨 삭제 실패");
      setLabels((current) => current.filter((item) => item.id !== label.id));
      setForm((current) => current.labelId === label.id ? { ...current, labelId: "" } : current);
    } catch (cause) {
      setLabelError(cause instanceof Error ? cause.message : "라벨을 삭제하지 못했습니다.");
    }
  };

  const getEventColor = (event: Event) => event.label?.color ?? event.color;
  const getEventLabel = (event: Event) => event.label?.name ?? "라벨 없음";
  const getEventTime = (event: Event) => event.allDay ? "종일" : `${dayjs(event.startDate).format("HH:mm")}–${dayjs(event.endDate).format("HH:mm")}`;

  const selectedEvents = selectedDay ? getEventsForDay(selectedDay) : [];
  const monthEvents = events
    .filter((event) => !dayjs(event.endDate).isBefore(current.startOf("month"), "day") && !dayjs(event.startDate).isAfter(current.endOf("month"), "day"))
    .sort((a, b) => dayjs(a.startDate).diff(dayjs(b.startDate)));
  const rightPanelEvents = selectedDay ? selectedEvents : monthEvents;
  const rightPanelPageSize = 4;
  const rightPanelPageCount = Math.ceil(rightPanelEvents.length / rightPanelPageSize);
  const safeRightPanelPage = Math.min(rightPanelPage, Math.max(0, rightPanelPageCount - 1));
  const visibleRightPanelEvents = rightPanelEvents.slice(safeRightPanelPage * rightPanelPageSize, (safeRightPanelPage + 1) * rightPanelPageSize);
  const mobileDay = selectedDay ?? dayjs();
  const mobileWeekStart = mobileDay.startOf("week");
  const mobileWeekEnd = mobileWeekStart.add(6, "day").endOf("day");
  const mobileWeekEvents = events
    .filter((event) => !dayjs(event.endDate).isBefore(mobileWeekStart, "day") && !dayjs(event.startDate).isAfter(mobileWeekEnd, "day"))
    .sort((a, b) => dayjs(a.startDate).diff(dayjs(b.startDate)));
  const selectMobileDay = (day: dayjs.Dayjs) => {
    setSelectedDay(day);
    setCurrent(day);
    setRightPanelPage(0);
  };

  return (
    <div className="h-full" onClick={() => setContextMenu(null)}>
      <div data-calendar-surface className="flex h-full flex-col md:hidden">
        {error && <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700"><span>{error}</span><button type="button" onClick={() => setReloadKey((current) => current + 1)} className="font-semibold underline">다시 시도</button></div>}
        <div className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
          <button type="button" onClick={() => selectMobileDay(mobileDay.subtract(1, "week"))} className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100" aria-label="이전 주"><ChevronLeft size={18} /></button>
          <button type="button" onClick={() => selectMobileDay(dayjs())} className="text-center">
            <p className="text-sm font-bold text-gray-900">{mobileWeekStart.format("YYYY년 M월 D일")} – {mobileWeekEnd.format("M월 D일")}</p>
            <p className="text-xs text-gray-400">주간 일정 · 오늘로 이동</p>
          </button>
          <button type="button" onClick={() => selectMobileDay(mobileDay.add(1, "week"))} className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100" aria-label="다음 주"><ChevronRight size={18} /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 border-b border-gray-100 bg-white px-3 py-2">
          {Array.from({ length: 7 }, (_, index) => mobileWeekStart.add(index, "day")).map((day) => (
            <button key={day.format("YYYY-MM-DD")} type="button" onClick={() => selectMobileDay(day)} className={`rounded-lg py-1.5 text-center ${mobileDay.isSame(day, "day") ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
              <span className="block text-[10px]">{"일월화수목금토"[day.day()]}</span><span className="block text-xs font-semibold">{day.date()}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-indigo-600" />
            <span className="text-sm font-semibold text-gray-800">이번 주 일정</span>
            <span className="text-xs text-gray-400">{mobileWeekEvents.length}개</span>
          </div>
          <button type="button" onClick={() => openModal(mobileDay)} className="flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700">
            <Plus size={15} />일정 추가
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {mobileWeekEvents.length === 0 ? (
            <button type="button" onClick={() => openModal(mobileDay)} className="flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 text-sm text-gray-400 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600">
              <Plus size={20} />이번 주 일정 추가
            </button>
          ) : (
            <div className="space-y-2">
              {mobileWeekEvents.map((event) => (
                <div key={event.id} className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                  <div className="mt-1 h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: getEventColor(event) }} />
                  <button
                    type="button"
                    onClick={() => openEditModal(event)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm font-semibold text-gray-800">{event.title}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-gray-500"><Clock size={12} />{dayjs(event.startDate).format("M/D (ddd)")} · {getEventTime(event)}</p>
                    {event.description && <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-500">{event.description}</p>}
                    <p className="mt-1 text-[10px] text-gray-400">{getEventLabel(event)}</p>
                  </button>
                  <button type="button" onClick={() => deleteEvent(event.id)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-rose-50 hover:text-rose-500" aria-label={`${event.title} 삭제`}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="hidden h-full gap-5 md:flex">
      {error && <div className="absolute left-4 right-4 top-3 z-10 flex items-center justify-between gap-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700"><span>{error}</span><button type="button" onClick={() => setReloadKey((current) => current + 1)} className="font-semibold underline">다시 시도</button></div>}
      {/* Calendar */}
      <div data-calendar-surface className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0 gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setCurrent((c) => c.subtract(1, "month")); setSelectedDay(null); setRightPanelPage(0); }}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <h2 className="text-lg font-bold text-gray-900 w-28 text-center">
              {current.format("YYYY년 M월")}
            </h2>
            <button
              onClick={() => { setCurrent((c) => c.add(1, "month")); setSelectedDay(null); setRightPanelPage(0); }}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => { setCurrent(dayjs()); setSelectedDay(null); setRightPanelPage(0); }}
              className="ml-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors"
            >
              오늘
            </button>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => openModal(selectedDay ?? dayjs())}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
              aria-label="일정 추가"
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              onClick={() => openLabelModal()}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <Tags size={14} />
              라벨 관리
            </button>
          </div>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1 flex-shrink-0">
          {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
            <div
              key={d}
              className={`text-center text-xs font-semibold py-2 ${i === 0 ? "text-rose-500" : i === 6 ? "text-sky-500" : "text-gray-400"}`}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="relative flex-1 overflow-hidden border border-gray-200 rounded-2xl overflow-y-auto">
          <div className="grid grid-cols-7 h-full" style={{ gridTemplateRows: `repeat(${weekRows.length}, minmax(80px, 1fr))` }}>
            {cells.map((day, idx) => {
              const isToday = day?.isSame(dayjs(), "day");
              const isSelected = day && selectedDay?.isSame(day, "day");
              const col = idx % 7;
              const isSun = col === 0, isSat = col === 6;
              return (
                <div
                  key={idx}
                  onClick={() => { if (day) { setSelectedDay(day); setRightPanelPage(0); } }}
                  onContextMenu={(event) => { if (!day) return; event.preventDefault(); setSelectedDay(day); setRightPanelPage(0); setContextMenu({ x: event.clientX, y: event.clientY, date: day }); }}
                  className={`group flex min-w-0 flex-col items-start justify-start overflow-hidden border-r border-b border-gray-100 p-1.5 cursor-pointer transition-colors
                    ${!day ? "bg-gray-50/50" : isSelected ? "bg-indigo-50" : "hover:bg-gray-50"}
                    ${idx % 7 === 6 ? "border-r-0" : ""}
                  `}
                >
                  {day && (
                    <>
                      <div className="flex w-full min-w-0 items-center justify-between mb-1">
                        <span
                          className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full
                            ${isToday ? "bg-indigo-600 text-white" : isSun ? "text-rose-500" : isSat ? "text-sky-500" : "text-gray-700"}
                          `}
                        >
                          {day.date()}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); openModal(day); }}
                          aria-label={`${day.format("M월 D일")} 일정 추가`}
                          className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-100 transition-all"
                        >
                          <Plus size={10} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="pointer-events-none absolute inset-0 grid grid-cols-7" style={{ gridTemplateRows: `repeat(${weekRows.length}, minmax(80px, 1fr))` }}>
            {eventSegments.map((segment) => (
              <button
                key={`${segment.event.id}-${segment.weekIndex}-${segment.startCol}-${segment.endCol}`}
                type="button"
                onClick={(event) => { event.stopPropagation(); openEditModal(segment.event); }}
                title={`${segment.event.title} · ${getEventTime(segment.event)}`}
                aria-label={`${segment.event.title}, ${getEventTime(segment.event)}`}
                className="pointer-events-auto z-10 mx-1 flex h-6 min-w-0 items-center gap-1 overflow-hidden rounded-lg px-1.5 text-[10px] font-semibold leading-none text-white shadow-sm ring-1 ring-white/35"
                style={{
                  backgroundColor: getEventColor(segment.event),
                  gridColumn: `${segment.startCol + 1} / ${segment.endCol + 2}`,
                  gridRow: segment.weekIndex + 1,
                  marginTop: `${32 + segment.laneIndex * 26}px`,
                }}
              >
                <span className="min-w-0 flex-1 truncate text-left text-[11px]">{segment.event.title}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel - 데스크탑에서만 표시 */}
      <div className="hidden w-64 min-h-0 flex-shrink-0 flex-col lg:flex">
        <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold text-gray-900">
                {selectedDay ? selectedDay.format("M월 D일 일정") : current.format("M월 일정")}
              </h3>
              <p className="mt-0.5 text-[11px] text-gray-400">{rightPanelEvents.length}개</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 self-start">
              <div className="flex rounded-md bg-gray-100 p-0.5" role="group" aria-label="일정 정보 표시 방식">
                <button
                  type="button"
                  aria-pressed={rightPanelMode === "detailed"}
                  onClick={() => { setRightPanelMode("detailed"); setRightPanelPage(0); }}
                  className={`flex h-7 w-7 items-center justify-center rounded ${rightPanelMode === "detailed" ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
                  title="설명형"
                  aria-label="설명형"
                ><AlignLeft size={13} /></button>
                <button
                  type="button"
                  aria-pressed={rightPanelMode === "compact"}
                  onClick={() => { setRightPanelMode("compact"); setRightPanelPage(0); }}
                  className={`flex h-7 w-7 items-center justify-center rounded ${rightPanelMode === "compact" ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
                  title="간략형"
                  aria-label="간략형"
                ><List size={13} /></button>
              </div>
              <button
                type="button"
                onClick={() => openModal(selectedDay ?? current)}
                aria-label="일정 추가"
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 transition-colors hover:bg-indigo-100"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>


          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {rightPanelEvents.length === 0 ? (
              <p className="rounded-lg bg-gray-50 px-3 py-8 text-center text-xs text-gray-500">
                {selectedDay ? "등록된 일정이 없습니다." : "이번 달 등록된 일정이 없습니다."}
              </p>
            ) : visibleRightPanelEvents.map((event) => (
              <div key={event.id} onClick={() => openEditModal(event)} className="group flex cursor-pointer items-start gap-2 rounded-lg border border-gray-100 p-2.5 text-left transition-colors hover:bg-gray-50">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getEventColor(event) }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-gray-900">{event.title}</p>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-gray-500">
                    <Clock size={10} className="shrink-0" />
                    {dayjs(event.startDate).format("M/D")} · {getEventTime(event)}
                  </p>
                  {rightPanelMode === "detailed" && (
                    <>
                      {event.description && <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-gray-500">{event.description}</p>}
                      <p className="mt-1 truncate text-[10px] text-gray-400">{getEventLabel(event)}</p>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(clickEvent) => { clickEvent.stopPropagation(); deleteEvent(event.id); }}
                  aria-label={`${event.title} 삭제`}
                  className="shrink-0 text-gray-300 opacity-0 transition-opacity hover:text-rose-500 group-hover:opacity-100"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>

          {rightPanelPageCount > 1 && (
            <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
              <button type="button" onClick={() => setRightPanelPage((page) => Math.max(0, page - 1))} disabled={rightPanelPage === 0} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">이전</button>
              <span className="text-[11px] text-gray-400">{safeRightPanelPage + 1} / {rightPanelPageCount}</span>
              <button type="button" onClick={() => setRightPanelPage((page) => Math.min(rightPanelPageCount - 1, page + 1))} disabled={safeRightPanelPage >= rightPanelPageCount - 1} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">다음</button>
            </div>
          )}
        </section>
      </div>

      </div>

      {/* Add event modal */}
      {showModal && (
        <ModalFrame title={editingEventId ? "일정 수정" : "일정 추가"} onClose={resetEventForm} className="max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-gray-900">{editingEventId ? "일정 수정" : "일정 추가"}</h3>
              <ModalCloseButton label={editingEventId ? "일정 수정 닫기" : "일정 추가 닫기"} onClick={resetEventForm} />
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">제목 *</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 transition-colors placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  placeholder="일정 제목"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">시작</label>
                  <input
                    type="datetime-local"
                    value={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                    className="min-w-0 w-full rounded-md border border-gray-200 bg-white px-2.5 py-2 text-xs text-gray-900 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">종료</label>
                  <input
                    type="datetime-local"
                    value={form.endDate}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                    className="min-w-0 w-full rounded-md border border-gray-200 bg-white px-2.5 py-2 text-xs text-gray-900 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">라벨</label>
                <select
                  value={form.labelId}
                  onChange={(e) => setForm((f) => ({ ...f, labelId: e.target.value }))}
                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">라벨 없음</option>
                  {labels.map((label) => (
                    <option key={label.id} value={label.id}>{label.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-gray-400">라벨 색상이 일정 카드와 달력에 적용됩니다.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">설명</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full resize-y rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 transition-colors placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  placeholder="선택 사항"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={resetEventForm}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                >
                  {saving ? "저장 중..." : editingEventId ? "수정" : "저장"}
                </button>
              </div>
            </form>
        </ModalFrame>
      )}
      {showLabelModal && (
        <ModalFrame title="라벨 관리" onClose={() => setShowLabelModal(false)} className="max-w-2xl p-6">
          <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
            <form onSubmit={saveLabel} className="space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <p className="text-sm font-semibold text-gray-800">{labelForm.id ? "라벨 수정" : "새 라벨 추가"}</p>
                <button type="button" onClick={() => openLabelModal()} className="text-xs text-gray-500 underline underline-offset-2">초기화</button>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">이름</label>
                <input value={labelForm.name} onChange={(event) => setLabelForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" placeholder="예: 회의, 홍보, 긴급" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">설명</label>
                <textarea value={labelForm.description} onChange={(event) => setLabelForm((current) => ({ ...current, description: event.target.value }))} className="min-h-20 w-full resize-y rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" placeholder="라벨 설명" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">색상</label>
                <input type="color" value={labelForm.color} onChange={(event) => setLabelForm((current) => ({ ...current, color: event.target.value }))} className="h-10 w-full rounded-md border border-gray-200 bg-white p-1" />
              </div>
              {labelError && <p className="text-xs font-medium text-rose-600">{labelError}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowLabelModal(false)} className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">닫기</button>
                <button type="submit" disabled={labelSaving} className="flex-1 rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">{labelSaving ? "저장 중..." : labelForm.id ? "수정" : "추가"}</button>
              </div>
            </form>
            <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <p className="text-sm font-semibold text-gray-800">공용 라벨</p>
                <span className="text-xs text-gray-400">{labels.length}개</span>
              </div>
              {labels.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400">아직 라벨이 없습니다.</div>
              ) : (
                <div className="space-y-2">
                  {labels.map((label) => (
                    <div key={label.id} className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: label.color }} />
                          <p className="truncate text-sm font-semibold text-gray-900">{label.name}</p>
                        </div>
                        {label.description && <p className="mt-1 text-xs text-gray-500">{label.description}</p>}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button type="button" onClick={() => openLabelModal(label)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label={`${label.name} 수정`}><PencilLine size={14} /></button>
                        <button type="button" onClick={() => removeLabel(label)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-rose-50 hover:text-rose-500" aria-label={`${label.name} 삭제`}><Trash size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ModalFrame>
      )}
      {contextMenu && (
        <div className="fixed z-50 rounded-xl border border-gray-200 bg-white p-1 shadow-xl" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
          <button type="button" onClick={() => { openModal(contextMenu.date); setContextMenu(null); }} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-indigo-50 hover:text-indigo-700"><Plus size={15} />새 일정</button>
        </div>
      )}
    </div>
  );
}
