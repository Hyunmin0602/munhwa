import KanbanBoard from "@/components/KanbanBoard";

export default async function KanbanPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="px-4 md:px-6 py-4 md:py-5 border-b border-slate-200 bg-white flex-shrink-0">
        <p className="flex items-center gap-2 text-xs font-semibold text-indigo-600"><span className="h-2 w-2 rounded-full bg-indigo-500" />사업 보드</p>
        <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900">사업 칸반</h2>
        <p className="text-xs text-slate-500 mt-1">
          <span className="hidden md:inline">드래그로 이동 · 빈 공간 또는 + 클릭으로 추가</span>
          <span className="md:hidden">화살표로 컬럼 이동 · 카드를 밀어 상태 변경</span>
        </p>
      </div>
      <div className="flex-1 overflow-hidden px-4 md:px-6 py-4 md:py-5">
        <KanbanBoard key={projectId} projectId={projectId} />
      </div>
    </div>
  );
}
