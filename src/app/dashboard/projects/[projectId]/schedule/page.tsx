import ScheduleCalendar from "@/components/ScheduleCalendar";

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 md:px-6 py-4 md:py-5 border-b border-gray-100 bg-white flex-shrink-0">
        <h2 className="text-lg font-bold text-gray-900">일정 관리</h2>
        <p className="text-xs text-gray-400 mt-0.5">날짜 클릭으로 선택 · + 버튼으로 일정 추가</p>
      </div>
      <div className="flex-1 overflow-hidden px-3 md:px-6 py-3 md:py-5">
        <ScheduleCalendar projectId={projectId} />
      </div>
    </div>
  );
}
