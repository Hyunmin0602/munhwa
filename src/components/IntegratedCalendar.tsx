"use client";

import { useEffect, useState, type FormEvent } from "react";
import dayjs from "dayjs";
import { ChevronLeft, ChevronRight, Plus, X, Tags, PencilLine, Trash } from "lucide-react";
import { apiFetch } from "@/lib/client-fetch";
import ModalFrame, { ModalCloseButton } from "@/components/ui/ModalFrame";

type Project = { id: string; name: string; color: string };
type Label = { id: string; name: string; description: string | null; color: string };
type Scope = "SPACE" | "PROJECT" | "PERSONAL";
type Kind = "BUSINESS" | "MEETING" | "OTHER";
type CalendarEvent = {
  id: string;
  projectId: string | null;
  project: Project | null;
  label: Label | null;
  scope: Scope;
  type: Kind;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  allDay: boolean;
  color: string;
};
type Form = {
  projectId: string;
  scope: Scope;
  type: Kind;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  labelId: string;
};
type FormChange = (changes: Partial<Form>) => void;

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const makeForm = (date: dayjs.Dayjs, projectId = ""): Form => ({
  projectId,
  scope: "PROJECT",
  type: "BUSINESS",
  title: "",
  description: "",
  startDate: date.format("YYYY-MM-DDT09:00"),
  endDate: date.format("YYYY-MM-DDT10:00"),
  allDay: false,
  labelId: "",
});

const getEventScopeLabel = (scope: Scope, projectID:string | null, projects:Project[]) => {
  if (scope === "SPACE") return "전역";
  if (scope === "PERSONAL") return "개인";
  const foundProject = projects.find((p) => projectID && p.id === projectID);
  return foundProject ?`${foundProject.name}` : "사업별" ;
};

const getEventColor = (event: CalendarEvent) => event.label?.color ?? (event.scope === "PROJECT" ? event.project?.color ?? event.color : event.color);
const getEventLabel = (event: CalendarEvent) => event.label?.name ?? "라벨 없음";
const getEventTime = (event: CalendarEvent) => event.allDay ? "종일" : `${dayjs(event.startDate).format("HH:mm")}–${dayjs(event.endDate).format("HH:mm")}`;

export default function IntegratedCalendar() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [month, setMonth] = useState(dayjs());
  const [selected, setSelected] = useState(dayjs());
  const [form, setForm] = useState<Form | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingEventColor, setEditingEventColor] = useState<string | null>(null);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [labelForm, setLabelForm] = useState({ id: "", name: "", description: "", color: "#6366f1" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [labelSaving, setLabelSaving] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([apiFetch("/api/projects"), apiFetch("/api/events"), apiFetch("/api/event-labels")])
      .then(async ([projectResponse, eventResponse, labelResponse]) => {
        if (!projectResponse.ok || !eventResponse.ok || !labelResponse.ok) throw new Error();
        const payload = await projectResponse.json();
        const labelPayload = await labelResponse.json();
        setProjects(Array.isArray(payload?.items) ? payload.items : []);
        setEvents(await eventResponse.json());
        setLabels(Array.isArray(labelPayload) ? labelPayload : []);
      })
      .catch(() => setError("통합 일정을 불러오지 못했습니다."));
  }, []);

  const getDayEvents = (date: dayjs.Dayjs) =>
    events.filter((event) => {
      const day = date.startOf("day");
      return !day.isBefore(dayjs(event.startDate).startOf("day")) &&
        !day.isAfter(dayjs(event.endDate).startOf("day"));
    });

  const resetEventForm = () => {
    setForm(null);
    setEditingEventId(null);
    setEditingEventColor(null);
  };

  const openCreate = (date = selected) => {
    setEditingEventId(null);
    setEditingEventColor(null);
    setForm(makeForm(date, projects[0]?.id));
  };

  const openEditModal = (event: CalendarEvent) => {
    setEditingEventId(event.id);
    setEditingEventColor(event.color);
    setForm({
      projectId: event.projectId ?? projects[0]?.id ?? "",
      scope: event.scope,
      type: event.type,
      title: event.title,
      description: event.description ?? "",
      startDate: dayjs(event.startDate).format("YYYY-MM-DDTHH:mm"),
      endDate: dayjs(event.endDate).format("YYYY-MM-DDTHH:mm"),
      allDay: event.allDay,
      labelId: event.label?.id ?? "",
    });
  };

  const updateForm: FormChange = (changes) => {
    setForm((current) => current ? { ...current, ...changes } : current);
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
      setForm((current) => current && current.labelId === label.id ? { ...current, labelId: "" } : current);
    } catch (cause) {
      setLabelError(cause instanceof Error ? cause.message : "라벨을 삭제하지 못했습니다.");
    }
  };

  const save = async (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    if (!form?.title.trim() || (form.scope === "PROJECT" && !form.projectId)) return;

    setSaving(true);
    try {
      const response = await apiFetch(editingEventId ? `/api/events/${editingEventId}` : "/api/events", {
        method: editingEventId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          title: form.title.trim(),
          projectId: form.scope === "PROJECT" ? form.projectId : null,
          labelId: form.labelId || null,
          ...(editingEventId ? { color: editingEventColor ?? undefined } : {}),
        }),
      });
      if (!response.ok) throw new Error();
      const saved = await response.json();
      setEvents((current) => editingEventId ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]);
      resetEventForm();
    } catch {
      setError("일정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (event: CalendarEvent) => {
    if (!confirm("이 일정을 삭제하시겠습니까?")) return;
    const response = await apiFetch(`/api/events/${event.id}`, { method: "DELETE" });
    if (response.ok) {
      setEvents((current) => current.filter((item) => item.id !== event.id));
    } else {
      setError("일정을 삭제하지 못했습니다.");
    }
  };

  const goToToday = () => {
    const today = dayjs();
    setMonth(today.startOf("month"));
    setSelected(today);
  };

  const changeMonth = (value: dayjs.Dayjs) => {
    const nextMonth = value.startOf("month");
    setMonth(nextMonth);
    setSelected(nextMonth);
  };

  const selectDate = (value: dayjs.Dayjs) => {
    setSelected(value);
    setMonth(value.startOf("month"));
  };

  return (
    <div className="mx-auto flex h-auto min-h-full max-w-7xl flex-col gap-4 p-4 pb-32 overscroll-y-auto md:h-full md:p-6">
      <CalendarHeader onCreate={() => openCreate()} onLabelManage={() => openLabelModal()} />
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
      <div className="grid min-h-0 flex-none gap-4 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_288px]">
        <div className="hidden min-h-0 md:block">
          <MonthCalendar
            month={month}
            selected={selected}
            getDayEvents={getDayEvents}
            onMonthChange={changeMonth}
            onSelect={selectDate}
            onCreate={openCreate}
            onEventClick={openEditModal}
            onToday={goToToday}
          />
        </div>
        <div className="md:hidden">
          <MobileDayCalendar
            month={month}
            selected={selected}
            getDayEvents={getDayEvents}
            onMonthChange={changeMonth}
            onSelect={selectDate}
            onToday={goToToday}
            onLabelManage={() => openLabelModal()}
            onEventClick={openEditModal}
          />
        </div>
        <div className="hidden lg:block">
          <SelectedDayEvents
            date={selected}
            events={getDayEvents(selected)}
            projects={projects}
            onRemove={remove}
            onEdit={openEditModal}
          />
        </div>
      </div>
      {form && (
        <EventFormModal
          form={form}
          projects={projects}
          labels={labels}
          saving={saving}
          onChange={updateForm}
          onSubmit={save}
          onClose={resetEventForm}
          isEditing={Boolean(editingEventId)}
        />
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
                <input value={labelForm.name} onChange={(event) => setLabelForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" placeholder="예: 회의, 홍보, 긴급" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">설명</label>
                <textarea value={labelForm.description} onChange={(event) => setLabelForm((current) => ({ ...current, description: event.target.value }))} className="min-h-20 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" placeholder="라벨 설명" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">색상</label>
                <input type="color" value={labelForm.color} onChange={(event) => setLabelForm((current) => ({ ...current, color: event.target.value }))} className="h-10 w-full rounded-xl border border-gray-200 bg-white p-1" />
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
    </div>
  );
}

function CalendarHeader({ onCreate, onLabelManage }: { onCreate: () => void; onLabelManage: () => void }) {
  return (
    <header className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold">통합 일정</h1>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onLabelManage} className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700">
          <Tags size={16} /> 라벨 관리
        </button>
        <button type="button" onClick={onCreate} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">
          <Plus size={16} /> 일정 등록
        </button>
      </div>
    </header>
  );
}

type MonthCalendarProps = {
  month: dayjs.Dayjs;
  selected: dayjs.Dayjs;
  getDayEvents: (date: dayjs.Dayjs) => CalendarEvent[];
  onMonthChange: (value: dayjs.Dayjs) => void;
  onSelect: (value: dayjs.Dayjs) => void;
  onCreate: (date: dayjs.Dayjs) => void;
  onEventClick: (event: CalendarEvent) => void;
  onToday: () => void;
};

function MonthCalendar({ month, selected, getDayEvents, onMonthChange, onSelect, onCreate, onEventClick, onToday }: MonthCalendarProps) {
  const cells: (dayjs.Dayjs | null)[] = [
    ...Array(month.startOf("month").day()).fill(null),
    ...Array.from({ length: month.daysInMonth() }, (_, index) => month.startOf("month").add(index, "day")),
  ];
  while (cells.length % 7) cells.push(null);

  return (
    <section className="flex min-h-0 flex-col rounded-2xl border border-gray-200 bg-white p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onMonthChange(month.startOf("month").subtract(1, "month"))} className="rounded-lg p-2 hover:bg-gray-100" aria-label="이전 달">
            <ChevronLeft size={17} />
          </button>
          <b>{month.format("YYYY년 M월")}</b>
          <button type="button" onClick={() => onMonthChange(month.startOf("month").add(1, "month"))} className="rounded-lg p-2 hover:bg-gray-100" aria-label="다음 달">
            <ChevronRight size={17} />
          </button>
        </div>
        <button type="button" onClick={onToday} className="rounded-lg border px-3 py-1.5 text-xs">오늘</button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-gray-400">
        {WEEKDAYS.map((name) => <div key={name} className="py-2">{name}</div>)}
      </div>
      <div className="grid flex-1 grid-cols-7 overflow-hidden rounded-xl border border-gray-200" style={{ gridAutoRows: "minmax(90px, 1fr)" }}>
        {cells.map((day, index) => (
          <CalendarCell
            key={day?.format("YYYY-MM-DD") ?? `empty-${index}`}
            day={day}
            selected={selected}
            events={day ? getDayEvents(day) : []}
            onSelect={onSelect}
            onCreate={onCreate}
            onEventClick={onEventClick}
          />
        ))}
      </div>
    </section>
  );
}

function MobileDayCalendar({ month, selected, getDayEvents, onMonthChange, onSelect, onToday, onLabelManage, onEventClick }: {
  month: dayjs.Dayjs;
  selected: dayjs.Dayjs;
  getDayEvents: (date: dayjs.Dayjs) => CalendarEvent[];
  onMonthChange: (value: dayjs.Dayjs) => void;
  onSelect: (value: dayjs.Dayjs) => void;
  onToday: () => void;
  onLabelManage: () => void;
  onEventClick: (event: CalendarEvent) => void;
}) {
  const weekStart = selected.startOf("week");
  const weekDays = Array.from({ length: 7 }, (_, index) => weekStart.add(index, "day"));
  const moveWeek = (amount: number) => onSelect(selected.add(amount, "week"));
  const monthLabel = month.format("YYYY년 M월");
  const weekLabel = `${weekStart.format("M월 D일")} - ${weekStart.add(6, "day").format("M월 D일")}`;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onMonthChange(month.startOf("month").subtract(1, "month"))} className="rounded-lg p-2 hover:bg-gray-100" aria-label="이전 달"><ChevronLeft size={17} /></button>
          <b>{monthLabel}</b>
          <button type="button" onClick={() => onMonthChange(month.startOf("month").add(1, "month"))} className="rounded-lg p-2 hover:bg-gray-100" aria-label="다음 달"><ChevronRight size={17} /></button>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onLabelManage} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">라벨 관리</button>
          <button type="button" onClick={onToday} className="rounded-lg border px-3 py-1.5 text-xs">오늘</button>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-2 py-2">
        <button type="button" onClick={() => moveWeek(-1)} className="rounded-lg p-2 hover:bg-white" aria-label="이전 주"><ChevronLeft size={17} /></button>
        <div className="text-center">
          <p className="text-base font-bold text-gray-900">{weekLabel}</p>
          <p className="text-xs text-gray-400">주간 일정</p>
        </div>
        <button type="button" onClick={() => moveWeek(1)} className="rounded-lg p-2 hover:bg-white" aria-label="다음 주"><ChevronRight size={17} /></button>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">
          이번 주 일정 {weekDays.reduce((count, day) => count + getDayEvents(day).length, 0)}개
        </p>
      </div>
      <div className="mt-3 space-y-2">
        {weekDays.map((day) => {
          const dayEvents = getDayEvents(day);
          return (
            <div
              key={day.format("YYYY-MM-DD")}
              onClick={() => onSelect(day)}
              className={`w-full rounded-xl border px-3 py-3 text-left ${day.isSame(selected, "day") ? "border-indigo-300 bg-indigo-50" : "border-gray-100 bg-white"}`}
            >
              <div className="flex items-start gap-3">
                <div className="w-12 shrink-0">
                  <p className={`text-xs font-semibold ${day.day() === 0 ? "text-rose-500" : day.day() === 6 ? "text-blue-500" : "text-gray-400"}`}>
                    {WEEKDAYS[day.day()]}
                  </p>
                  <p className="text-lg font-bold text-gray-900">{day.date()}</p>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  {dayEvents.length === 0 ? (
                    <p className="py-1 text-xs text-gray-400">일정 없음</p>
                  ) : dayEvents.map((event) => (
                    <button key={event.id} type="button" onClick={(clickEvent) => { clickEvent.stopPropagation(); onEventClick(event); }} className="flex w-full items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-left text-sm shadow-sm hover:bg-indigo-50">
                      <span className="h-6 w-1 shrink-0 rounded-full" style={{ backgroundColor: getEventColor(event) }} />
                      <span className="min-w-0 flex-1 truncate">{event.title}</span>
                      <span className="shrink-0 text-[10px] text-gray-500">{getEventTime(event)}</span>
                      {event.scope === "SPACE" && <span className="shrink-0 text-[10px] text-slate-500">전역</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

type CalendarCellProps = {
  day: dayjs.Dayjs | null;
  selected: dayjs.Dayjs;
  events: CalendarEvent[];
  onSelect: (value: dayjs.Dayjs) => void;
  onCreate: (value: dayjs.Dayjs) => void;
  onEventClick: (event: CalendarEvent) => void;
};

function CalendarCell({ day, selected, events, onSelect, onCreate, onEventClick }: CalendarCellProps) {
  return (
    <div
      onClick={() => day && onSelect(day)}
      onDoubleClick={() => day && onCreate(day)}
      className={`flex min-w-0 flex-col items-start justify-start border-b border border-gray-200 p-1 text-left ${day?.isSame(selected, "day") ? "bg-indigo-50" : "hover:bg-gray-50"}`}
    >
      {day && (
        <>
          <span className="text-xs">{day.date()}</span>
          {events.slice(0, 3).map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={(clickEvent) => { clickEvent.stopPropagation(); onEventClick(event); }}
              className={`mt-1 flex w-full items-center truncate rounded px-1.5 py-0.5 text-[10px] text-left text-white ${event.scope === "SPACE" ? "font-bold shadow-sm ring-2 ring-slate-900/20" : ""}`}
              style={{ backgroundColor: getEventColor(event) }}
            >
              <span className="min-w-0 truncate">{event.title}</span>
              <span className="ml-1 shrink-0 text-[9px] opacity-90">{getEventTime(event)}</span>
            </button>
          ))}
          {events.length > 3 && <span className="mt-1 block w-full truncate px-1 text-[10px] font-medium text-gray-500">+{events.length - 3}개 더 보기</span>}
        </>
      )}
    </div>
  );
}

function SelectedDayEvents({ date, events,projects, onRemove, onEdit }: { date: dayjs.Dayjs; events: CalendarEvent[];projects:Project[]; onRemove: (event: CalendarEvent) => void; onEdit: (event: CalendarEvent) => void }) {
  return (
    <section className="h-fit rounded-2xl border border-gray-200 bg-white p-4 lg:sticky lg:top-4">
      <h3 className="mb-2 text-sm font-bold">{date.format("M월 D일")} 일정</h3>
      {events.map((event) => (
        <div key={event.id} onClick={() => onEdit(event)} className={`flex cursor-pointer items-center gap-2 rounded-lg py-1 text-sm ${event.scope === "SPACE" ? "bg-slate-50 px-2 font-semibold" : "hover:bg-gray-50"}`}>
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getEventColor(event) }} />
          <span className="flex-1">
            {event.title}
            <small className="ml-2 text-xs font-normal text-gray-500">{getEventTime(event)}</small>
            <small className="ml-2 text-xs text-gray-400">{getEventScopeLabel(event.scope, event.projectId,projects)}</small>
            <small className="ml-2 text-xs text-gray-400">{getEventLabel(event)}</small>
          </span>
          <button type="button" onClick={(clickEvent) => { clickEvent.stopPropagation(); void onRemove(event); }} aria-label="일정 삭제"><X size={14} /></button>
        </div>
      ))}
    </section>
  );
}

type EventFormModalProps = {
  form: Form;
  projects: Project[];
  labels: Label[];
  saving: boolean;
  onChange: FormChange;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
  isEditing: boolean;
};

function EventFormModal({ form, projects, labels, saving, onChange, onSubmit, onClose, isEditing }: EventFormModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <form onSubmit={onSubmit} onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{isEditing ? "일정 수정" : "일정 등록"}</h2>
          <button type="button" onClick={onClose} aria-label="닫기"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold">
            유형
            <select value={form.type} onChange={(event) => onChange({ type: event.target.value as Kind })} className="mt-1 w-full rounded-xl border border-gray-300 p-2">
              <option value="BUSINESS">사업</option>
              <option value="MEETING">회의</option>
              <option value="OTHER">기타</option>
            </select>
          </label>
          <label className="text-xs font-semibold">
            공개 범위
            <select value={form.scope} onChange={(event) => onChange({ scope: event.target.value as Scope })} className="mt-1 w-full rounded-xl border border-gray-300 p-2">
              <option value="SPACE">전역</option>
              <option value="PROJECT">사업별 저장</option>
              <option value="PERSONAL">개인용 저장</option>
            </select>
          </label>
        </div>
        <div>
       {form.scope === "PROJECT" && (
        <label className="block text-xs font-semibold">
          사업
          <select value={form.projectId} onChange={(event) => onChange({ projectId: event.target.value })} className="mt-1 w-full rounded-xl border border-gray-300 p-2 disabled:bg-gray-100">
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
       )}</div>
        <label className="block text-xs font-semibold">
          라벨
          <select value={form.labelId} onChange={(event) => onChange({ labelId: event.target.value })} className="mt-1 w-full rounded-xl border border-gray-300 p-2">
            <option value="">라벨 없음</option>
            {labels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}
          </select>
        </label>
        <input required placeholder="일정 제목" value={form.title} onChange={(event) => onChange({ title: event.target.value })} className="w-full rounded-xl border border-gray-300 p-2" />
        <div className="grid grid-cols-2 gap-2">
          <input required type="datetime-local" value={form.startDate} onChange={(event) => onChange({ startDate: event.target.value })} className="rounded-xl border border-gray-300 p-2 text-xs" />
          <input required type="datetime-local" value={form.endDate} onChange={(event) => onChange({ endDate: event.target.value })} className="rounded-xl border border-gray-300 p-2 text-xs" />
        </div>
        <textarea placeholder="설명 (선택)" value={form.description} onChange={(event) => onChange({ description: event.target.value })} className="w-full rounded-xl border border-gray-300 p-2" />
        <button type="submit" disabled={saving} className="w-full rounded-xl bg-indigo-600 py-2 text-sm font-semibold text-white">
          {saving ? "저장 중..." : "저장"}
        </button>
      </form>
    </div>
  );
}
