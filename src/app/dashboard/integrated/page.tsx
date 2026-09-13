"use client";

import { useState } from "react";
import { CalendarDays, CheckSquare } from "lucide-react";
import IntegratedCalendar from "@/components/IntegratedCalendar";
import IntegratedKanban from "@/components/IntegratedKanban";

export default function IntegratedPage() {
  const [tab, setTab] = useState<"kanban" | "calendar">("kanban");

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <nav className="flex flex-shrink-0 gap-1 border-b border-gray-200 bg-white px-4 pt-3 md:px-6" aria-label="통합 업무 유형">
        <button
          type="button"
          onClick={() => setTab("kanban")}
          className={`inline-flex items-center gap-2 rounded-t-xl px-4 py-3 text-sm font-semibold ${tab === "kanban" ? "bg-indigo-50 text-indigo-700" : "text-gray-500 hover:bg-gray-50"}`}
        >
          <CheckSquare size={16} />칸반
        </button>
        <button
          type="button"
          onClick={() => setTab("calendar")}
          className={`inline-flex items-center gap-2 rounded-t-xl px-4 py-3 text-sm font-semibold ${tab === "calendar" ? "bg-indigo-50 text-indigo-700" : "text-gray-500 hover:bg-gray-50"}`}
        >
          <CalendarDays size={16} />일정
        </button>
      </nav>
      <main className="min-h-0 flex-1">
        {tab === "kanban" ? <IntegratedKanban /> : <IntegratedCalendar />}
      </main>
    </div>
  );
}
