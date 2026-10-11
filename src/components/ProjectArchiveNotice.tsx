"use client";

import { useEffect, useState } from "react";
import { Archive } from "lucide-react";
import { apiFetch } from "@/lib/client-fetch";

type ArchiveState = { isArchived: boolean; accessScope: "SPACE" | "MEMBERS" };

export default function ProjectArchiveNotice({ projectId }: { projectId: string }) {
  const [archiveState, setArchiveState] = useState<ArchiveState | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/projects/${projectId}?view=archive-state`, undefined, { showGlobalError: false })
      .then(async (response) => {
        if (!response.ok) return;
        const project = await response.json();
        if (!cancelled) setArchiveState({ isArchived: project.isArchived === true, accessScope: project.accessScope === "SPACE" ? "SPACE" : "MEMBERS" });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [projectId]);

  if (!archiveState?.isArchived) return null;

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-100 px-4 py-2 text-xs text-slate-700 md:px-8">
      <Archive size={14} className="shrink-0" />
      <span className="font-semibold">기록용 사업</span>
      <span className="text-slate-500">열람 전용 · {archiveState.accessScope === "SPACE" ? "Space 구성원 전체 공개" : "지정된 사업 구성원만 열람"}</span>
    </div>
  );
}
