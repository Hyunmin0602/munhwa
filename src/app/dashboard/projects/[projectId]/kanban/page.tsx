import KanbanBoard from "@/components/KanbanBoard";

export default async function KanbanPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-5 border-b border-gray-100 bg-white flex-shrink-0">
        <h2 className="text-lg font-bold text-gray-900">칸반보드</h2>
        <p className="text-xs text-gray-400 mt-0.5">드래그로 이동 · 빈 공간 또는 + 클릭으로 추가</p>
      </div>
      <div className="flex-1 overflow-hidden px-6 py-5">
        <KanbanBoard projectId={projectId} />
      </div>
    </div>
  );
}
