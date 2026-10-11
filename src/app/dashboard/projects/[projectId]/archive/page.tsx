import ArchiveList from "@/components/ArchiveList";

export default async function ArchivePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <div className="business-page business-page-archive h-full flex flex-col bg-slate-50">
      <header className="business-page-header flex-shrink-0 border-b border-slate-200 bg-white px-4 py-4 md:px-8 md:py-6">
        <p className="business-page-eyebrow text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">사업 업무</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">아카이브</h1>
        <p className="mt-2 text-sm text-slate-500">마크다운 문서 작성 · 공개 시 외부 링크로 공유</p>
      </header>
      <div className="business-page-content flex-1 overflow-hidden px-3 py-3 md:px-8 md:py-6">
        <ArchiveList projectId={projectId} />
      </div>
    </div>
  );
}
