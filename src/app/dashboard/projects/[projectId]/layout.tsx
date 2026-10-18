import ProjectArchiveNotice from "@/components/ProjectArchiveNotice";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ProjectArchiveNotice projectId={projectId} />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
