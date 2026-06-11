"use client";
import { useState, useEffect } from "react";
import dayjs from "dayjs";
import "dayjs/locale/ko";
import { ChevronLeft, ChevronRight, Plus, X, Clock, CalendarDays } from "lucide-react";

dayjs.locale("ko");

interface Event {
  id: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  allDay: boolean;
  color: string;
}

const EVENT_COLORS = [
  { label: "인디고", value: "#6366f1" },
  { label: "핑크",   value: "#ec4899" },
  { label: "에메랄드", value: "#10b981" },
  { label: "앰버",   value: "#f59e0b" },
  { label: "스카이", value: "#0ea5e9" },
  { label: "로즈",   value: "#f43f5e" },
];

export default function ScheduleCalendar({ projectId }: { projectId: string }) {
  const [current, setCurrent] = useState(dayjs());
  const [events, setEvents] = useState<Event[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", startDate: "", endDate: "", allDay: false, color: "#6366f1",
  });
  const [saving, setSaving] = useState(false);
  const [selectedDay, setSelectedDay] = useState<dayjs.Dayjs | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/events`)
      .then((r) => r.json())
      .then((data) => setEvents(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [projectId]);

  const startDay = current.startOf("month").day();
  const daysInMonth = current.daysInMonth();
  const startOfMonth = current.startOf("month");

  const cells: (dayjs.Dayjs | null)[] = [
    ...Array(startDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => startOfMonth.add(i, "day")),
  ];
  // pad to complete weeks
  while (cells.length % 7 !== 0) cells.push(null);

  const getEventsForDay = (day: dayjs.Dayjs) =>
    events.filter((e) => {
      const s = dayjs(e.startDate).startOf("day");
      const en = dayjs(e.endDate).startOf("day");
      const d = day.startOf("day");
      return !d.isBefore(s) && !d.isAfter(en);
    });

  const openModal = (date: dayjs.Dayjs) => {
    const ds = date.format("YYYY-MM-DD");
    setForm({ title: "", description: "", startDate: ds + "T09:00", endDate: ds + "T10:00", allDay: false, color: "#6366f1" });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      const ev = await res.json();
      setEvents((prev) => [...prev, ev]);
      setShowModal(false);
    }
  };

  const deleteEvent = async (id: string) => {
    await fetch(`/api/projects/${projectId}/events/${id}`, { method: "DELETE" });
    setEvents((prev) => prev.filter((e) => e.id !== id));
  };

  const selectedEvents = selectedDay ? getEventsForDay(selectedDay) : [];
  const upcomingEvents = events
    .filter((e) => dayjs(e.startDate).isAfter(dayjs().subtract(1, "day")))
    .sort((a, b) => dayjs(a.startDate).diff(dayjs(b.startDate)))
    .slice(0, 8);

  return (
    <div className="flex gap-5 h-full">
      {/* Calendar */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrent((c) => c.subtract(1, "month"))}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <h2 className="text-lg font-bold text-gray-900 w-28 text-center">
              {current.format("YYYY년 M월")}
            </h2>
            <button
              onClick={() => setCurrent((c) => c.add(1, "month"))}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => setCurrent(dayjs())}
              className="ml-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors"
            >
              오늘
            </button>
          </div>
          <button
            onClick={() => openModal(selectedDay ?? dayjs())}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <Plus size={14} />
            일정 추가
          </button>
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
        <div className="flex-1 overflow-hidden border border-gray-200 rounded-2xl overflow-y-auto">
          <div className="grid grid-cols-7 h-full" style={{ gridAutoRows: "minmax(80px, 1fr)" }}>
            {cells.map((day, idx) => {
              const dayEvents = day ? getEventsForDay(day) : [];
              const isToday = day?.isSame(dayjs(), "day");
              const isSelected = day && selectedDay?.isSame(day, "day");
              const col = idx % 7;
              const isSun = col === 0, isSat = col === 6;
              return (
                <div
                  key={idx}
                  onClick={() => day && setSelectedDay(day)}
                  className={`border-r border-b border-gray-100 p-1.5 cursor-pointer transition-colors
                    ${!day ? "bg-gray-50/50" : isSelected ? "bg-indigo-50" : "hover:bg-gray-50"}
                    ${idx % 7 === 6 ? "border-r-0" : ""}
                  `}
                >
                  {day && (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full
                            ${isToday ? "bg-indigo-600 text-white" : isSun ? "text-rose-500" : isSat ? "text-sky-500" : "text-gray-700"}
                          `}
                        >
                          {day.date()}
                        </span>
                        {dayEvents.length > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openModal(day); }}
                            className="opacity-0 hover:opacity-100 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-100 transition-all"
                          >
                            <Plus size={10} />
                          </button>
                        )}
                      </div>
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 3).map((ev) => (
                          <div
                            key={ev.id}
                            onClick={(e) => e.stopPropagation()}
                            title={ev.title}
                            className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md text-white truncate"
                            style={{ backgroundColor: ev.color }}
                          >
                            <span className="truncate">{ev.title}</span>
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <span className="text-xs text-gray-400 pl-1">+{dayEvents.length - 3}개</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right panel - 데스크탑에서만 표시 */}
      <div className="hidden lg:flex w-64 flex-shrink-0 flex-col gap-4">
        {/* Selected day events */}
        {selectedDay && (
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-800">
                {selectedDay.format("M월 D일")} <span className="text-gray-400 font-normal">{selectedDay.format("ddd")}</span>
              </h3>
              <button
                onClick={() => openModal(selectedDay)}
                className="w-6 h-6 flex items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
              >
                <Plus size={12} />
              </button>
            </div>
            {selectedEvents.length === 0 ? (
              <button
                onClick={() => openModal(selectedDay)}
                className="w-full py-4 text-xs text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-xl border-2 border-dashed border-gray-200 hover:border-indigo-200 transition-all"
              >
                + 일정 추가
              </button>
            ) : (
              <div className="space-y-2">
                {selectedEvents.map((ev) => (
                  <div key={ev.id} className="flex items-start gap-2 group">
                    <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: ev.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{ev.title}</p>
                      <p className="text-xs text-gray-400">
                        {dayjs(ev.startDate).format("HH:mm")} – {dayjs(ev.endDate).format("HH:mm")}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteEvent(ev.id)}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-rose-400 transition-all"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Upcoming events */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 flex-1 overflow-y-auto">
          <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <CalendarDays size={14} className="text-indigo-500" />
            예정 일정
          </h3>
          {upcomingEvents.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">예정된 일정이 없습니다</p>
          ) : (
            <div className="space-y-2.5">
              {upcomingEvents.map((ev) => (
                <div key={ev.id} className="flex items-start gap-2.5 group">
                  <div
                    className="w-1 rounded-full flex-shrink-0 self-stretch"
                    style={{ backgroundColor: ev.color, minHeight: "28px" }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{ev.title}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <Clock size={9} />
                      {dayjs(ev.startDate).format("M/D HH:mm")}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteEvent(ev.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-rose-400 transition-all"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add event modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-gray-900">일정 추가</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">제목 *</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 focus:bg-white transition-colors"
                  placeholder="일정 제목"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">시작</label>
                  <input
                    type="datetime-local"
                    value={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 focus:bg-white transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">종료</label>
                  <input
                    type="datetime-local"
                    value={form.endDate}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 focus:bg-white transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">색상</label>
                <div className="flex gap-2">
                  {EVENT_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, color: c.value }))}
                      className={`w-7 h-7 rounded-full transition-all ${form.color === c.value ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : "hover:scale-105"}`}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">설명</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 focus:bg-white transition-colors"
                  placeholder="선택 사항"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                >
                  {saving ? "저장 중..." : "저장"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
