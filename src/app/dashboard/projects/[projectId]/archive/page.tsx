import ArchiveList from "@/components/ArchiveList";

export default async function ArchivePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-5 border-b border-gray-100 bg-white flex-shrink-0">
        <h2 className="text-lg font-bold text-gray-900">아카이브</h2>
        <p className="text-xs text-gray-400 mt-0.5">마크다운 문서 작성 · 공개 시 외부 링크로 공유</p>
      </div>
      <div className="flex-1 overflow-hidden px-6 py-5">
        <ArchiveList projectId={projectId} />
      </div>
    </div>
  );
}
