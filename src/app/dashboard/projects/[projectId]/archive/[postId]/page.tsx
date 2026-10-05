import ArchiveEditor from "@/components/ArchiveEditor";

export default async function ArchivePostPage({
  params,
}: {
  params: Promise<{ projectId: string; postId: string }>;
}) {
  const { projectId, postId } = await params;
  return (
    <div className="h-full flex flex-col">
      <ArchiveEditor projectId={projectId} postId={postId} />
    </div>
  );
}
