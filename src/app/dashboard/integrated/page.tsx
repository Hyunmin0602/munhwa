"use client";

import { useState } from "react";
import { CalendarDays, CheckSquare, FileText } from "lucide-react";
import IntegratedArchive from "@/components/IntegratedArchive";
import IntegratedCalendar from "@/components/IntegratedCalendar";
import IntegratedKanban from "@/components/IntegratedKanban";

type Tab = "kanban" | "calendar" | "archive";

const tabs: Array<{ id: Tab; label: string; Icon: typeof CheckSquare }> = [
  { id: "kanban", label: "칸반", Icon: CheckSquare },
  { id: "calendar", label: "일정", Icon: CalendarDays },
  { id: "archive", label: "아카이브", Icon: FileText },
];

export default function IntegratedPage() {
  const [tab, setTab] = useState<Tab>("kanban");

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <nav className="flex flex-shrink-0 gap-1 border-b border-gray-200 bg-white px-4 pt-3 md:px-6" aria-label="통합 업무 유형">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 rounded-t-xl px-4 py-3 text-sm font-semibold ${tab === id ? "bg-indigo-50 text-indigo-700" : "text-gray-500 hover:bg-gray-50"}`}
          >
            <Icon size={16} />{label}
          </button>
        ))}
      </nav>
      <main className="min-h-0 flex-1">
        {tab === "kanban" && <IntegratedKanban />}
        {tab === "calendar" && <IntegratedCalendar />}
        {tab === "archive" && <IntegratedArchive />}
      </main>
    </div>
  );
}
