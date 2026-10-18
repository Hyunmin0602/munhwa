import KanbanBoard from "@/components/KanbanBoard";

export default async function KanbanPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <div className="business-page business-page-kanban h-full flex flex-col bg-slate-50">
      <header className="business-page-header flex-shrink-0 border-b border-slate-200 bg-white px-4 py-4 md:px-8 md:py-6">
        <p className="business-page-eyebrow text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">사업 업무</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">칸반 보드</h1>
        <p className="mt-2 text-sm text-slate-500">
          <span className="hidden md:inline">드래그로 이동 · 빈 공간 또는 + 클릭으로 추가</span>
          <span className="md:hidden">화살표로 컬럼 이동 · 카드를 밀어 상태 변경</span>
        </p>
      </header>
      <div className="business-page-content flex-1 overflow-hidden px-4 py-4 md:px-8 md:py-6">
        <KanbanBoard key={projectId} projectId={projectId} />
      </div>
    </div>
  );
}
