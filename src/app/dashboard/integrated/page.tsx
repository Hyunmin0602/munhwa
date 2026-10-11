"use client";

import { useState } from "react";
import { CalendarDays, CheckSquare } from "lucide-react";
import IntegratedArchive from "@/components/IntegratedArchive";
import IntegratedCalendar from "@/components/IntegratedCalendar";
import IntegratedKanban from "@/components/IntegratedKanban";

type Tab = "kanban" | "calendar" | "archive";

const tabs: Array<{ id: Tab; label: string; Icon: typeof CheckSquare }> = [
  { id: "kanban", label: "칸반", Icon: CheckSquare },
  { id: "calendar", label: "일정", Icon: CalendarDays },
  { id: "archive", label: "아카이브", Icon: CheckSquare },
];

export default function IntegratedPage() {
  const [tab, setTab] = useState<Tab>("kanban");

  return (
    <div className="flex h-auto min-h-full flex-col bg-gray-50 md:h-full">
      <nav className="sticky top-0 z-10 flex flex-shrink-0 gap-1 border-b border-gray-200 bg-white px-4 pt-3 backdrop-blur md:px-6" role="tablist" aria-label="통합 업무 유형">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            role="tab"
            aria-selected={tab === id}
            aria-controls="integrated-tabpanel"
            className={`inline-flex items-center gap-2 border-b-2 border-transparent px-4 py-3 text-sm font-semibold transition-colors ${tab === id ? "text-indigo-600" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"}`}
          >
            <Icon size={16} />{label}
          </button>
        ))}
      </nav>
      <main id="integrated-tabpanel" role="tabpanel" tabIndex={0} className="min-h-0 flex-1 overflow-visible focus-visible:outline-none">
        {tab === "kanban" && <IntegratedKanban />}
        {tab === "calendar" && <IntegratedCalendar />}
        {tab === "archive" && <IntegratedArchive />}
      </main>
    </div>
  );
}
