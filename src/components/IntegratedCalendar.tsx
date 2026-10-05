"use client";

import { useEffect, useState, type FormEvent } from "react";
import dayjs from "dayjs";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { apiFetch } from "@/lib/client-fetch";

type Project = { id: string; name: string; color: string };
type Scope = "SPACE" | "PROJECT" | "PERSONAL";
type Kind = "BUSINESS" | "MEETING" | "OTHER";
type CalendarEvent = {
  id: string;
  projectId: string | null;
  scope: Scope;
  type: Kind;
  title: string;
  startDate: string;
  endDate: string;
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
});

const getEventScopeLabel = (scope: Scope, projectID:string | null, projects:Project[]) => {
  if (scope === "SPACE") return "전역";
  if (scope === "PERSONAL") return "개인";
  const foundProject = projects.find((p) => projectID && p.id === projectID);
  return foundProject ?`${foundProject.name}` : "사업별" ;
};

export default function IntegratedCalendar() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [month, setMonth] = useState(dayjs());
  const [selected, setSelected] = useState(dayjs());
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void Promise.all([apiFetch("/api/projects"), apiFetch("/api/events")])
      .then(async ([projectResponse, eventResponse]) => {
        if (!projectResponse.ok || !eventResponse.ok) throw new Error();
        const payload = await projectResponse.json();
        setProjects(Array.isArray(payload?.items) ? payload.items : []);
        setEvents(await eventResponse.json());
      })
      .catch(() => setError("통합 일정을 불러오지 못했습니다."));
  }, []);

  const getDayEvents = (date: dayjs.Dayjs) =>
    events.filter((event) => {
      const day = date.startOf("day");
      return !day.isBefore(dayjs(event.startDate).startOf("day")) &&
        !day.isAfter(dayjs(event.endDate).startOf("day"));
    });

  const openCreate = (date = selected) => setForm(makeForm(date, projects[0]?.id));

  const updateForm: FormChange = (changes) => {
    setForm((current) => current ? { ...current, ...changes } : current);
  };

  const save = async (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    if (!form?.title.trim() || (form.scope === "PROJECT" && !form.projectId)) return;

    setSaving(true);
    try {
      const response = await apiFetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          title: form.title.trim(),
          projectId: form.scope === "PROJECT" ? form.projectId : null,
        }),
      });
      if (!response.ok) throw new Error();
      const saved = await response.json();
      setEvents((current) => [...current, saved]);
      setForm(null);
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
    setMonth(today);
    setSelected(today);
  };

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-4 p-4 md:p-6">
      <CalendarHeader onCreate={() => openCreate()} />
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <MonthCalendar
          month={month}
          selected={selected}
          getDayEvents={getDayEvents}
          onMonthChange={setMonth}
          onSelect={setSelected}
          onCreate={openCreate}
          onToday={goToToday}
        />
        <SelectedDayEvents
          date={selected}
          events={getDayEvents(selected)}
          projects={projects}
          onRemove={remove}
        />
      </div>
      {form && (
        <EventFormModal
          form={form}
          projects={projects}
          saving={saving}
          onChange={updateForm}
          onSubmit={save}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}

function CalendarHeader({ onCreate }: { onCreate: () => void }) {
  return (
    <header className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold">통합 일정</h1>
      </div>
      <button type="button" onClick={onCreate} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">
        <Plus size={16} /> 일정 등록
      </button>
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
  onToday: () => void;
};

function MonthCalendar({ month, selected, getDayEvents, onMonthChange, onSelect, onCreate, onToday }: MonthCalendarProps) {
  const cells: (dayjs.Dayjs | null)[] = [
    ...Array(month.startOf("month").day()).fill(null),
    ...Array.from({ length: month.daysInMonth() }, (_, index) => month.startOf("month").add(index, "day")),
  ];
  while (cells.length % 7) cells.push(null);

  return (
    <section className="flex min-h-0 flex-col rounded-2xl border border-gray-200 bg-white p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onMonthChange(month.subtract(1, "month"))} className="rounded-lg p-2 hover:bg-gray-100" aria-label="이전 달">
            <ChevronLeft size={17} />
          </button>
          <b>{month.format("YYYY년 M월")}</b>
          <button type="button" onClick={() => onMonthChange(month.add(1, "month"))} className="rounded-lg p-2 hover:bg-gray-100" aria-label="다음 달">
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
          />
        ))}
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
};

function CalendarCell({ day, selected, events, onSelect, onCreate }: CalendarCellProps) {
  return (
    <button
      type="button"
      onClick={() => day && onSelect(day)}
      onDoubleClick={() => day && onCreate(day)}
      className={`min-w-0 border-b border border-gray-200 p-1 text-left ${day?.isSame(selected, "day") ? "bg-indigo-50" : "hover:bg-gray-50"}`}
    >
      {day && (
        <>
          <span className="text-xs">{day.date()}</span>
          {events.slice(0, 3).map((event) => (
            <span key={event.id} className="mt-1 block truncate rounded px-1 py-0.5 text-[10px] text-white" style={{ backgroundColor: event.color }}>
              {event.title}
            </span>
          ))}
        </>
      )}
    </button>
  );
}

function SelectedDayEvents({ date, events,projects, onRemove }: { date: dayjs.Dayjs; events: CalendarEvent[];projects:Project[]; onRemove: (event: CalendarEvent) => void }) {
  return (
    <section className="h-fit rounded-2xl border border-gray-200 bg-white p-4 lg:sticky lg:top-4">
      <h3 className="mb-2 text-sm font-bold">{date.format("M월 D일")} 일정</h3>
      {events.map((event) => (
        <div key={event.id} className="flex items-center gap-2 py-1 text-sm">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: event.color }} />
          <span className="flex-1">
            {event.title}
            <small className="ml-2 text-xs text-gray-400">{getEventScopeLabel(event.scope, event.projectId,projects)}</small>
          </span>
          <button type="button" onClick={() => void onRemove(event)} aria-label="일정 삭제"><X size={14} /></button>
        </div>
      ))}
    </section>
  );
}

type EventFormModalProps = {
  form: Form;
  projects: Project[];
  saving: boolean;
  onChange: FormChange;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
};

function EventFormModal({ form, projects, saving, onChange, onSubmit, onClose }: EventFormModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <form onSubmit={onSubmit} onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">일정 등록</h2>
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
