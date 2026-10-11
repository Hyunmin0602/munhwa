export type ActivityInput = {
  actorId: string;
  spaceId?: string | null;
  projectId?: string | null;
  type: string;
  action: string;
  entityType: string;
  entityId: string;
  title?: string | null;
  metadata?: Record<string, unknown>;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
};

type EventState = {
  id: string;
  spaceId: string | null;
  projectId: string | null;
  scope: string;
  title: string;
  description: string | null;
  color: string;
  type: string;
  startDate: Date;
  endDate: Date;
  allDay: boolean;
  labelId: string | null;
};

export function eventActivityInputs(actorId: string, before: EventState | null, after: EventState | null): ActivityInput[] {
  const event = after ?? before;
  if (!event) return [];
  const includesPersonal = before?.scope === "PERSONAL" || after?.scope === "PERSONAL";
  const targets = new Map<string, string | null>();
  for (const state of [before, after]) {
    if (state && state.scope !== "PERSONAL" && state.spaceId) targets.set(state.spaceId, state.projectId);
  }
  const snapshot = (state: EventState | null) => state ? includesPersonal
    ? { scope: state.scope, projectId: state.projectId }
    : { title: state.title, description: state.description, startDate: state.startDate, endDate: state.endDate, allDay: state.allDay, color: state.color, type: state.type, scope: state.scope, projectId: state.projectId, labelId: state.labelId }
    : null;
  return [...targets].map(([spaceId, projectId]) => ({
    actorId, spaceId, projectId, type: "일정", action: !before ? "생성" : !after ? "삭제" : "수정",
    entityType: "EVENT", entityId: event.id, title: includesPersonal ? "일정 공개 범위 변경" : event.title,
    beforeData: snapshot(before), afterData: snapshot(after),
  }));
}

type ActivityData = Omit<ActivityInput, "spaceId" | "projectId" | "title" | "metadata" | "beforeData" | "afterData"> & {
  spaceId: string;
  projectId: string | null;
  title: string | null;
  metadata: string | null;
  beforeData: string | null;
  afterData: string | null;
};

export function createActivityRecorder(dependencies: {
  findProjectSpace: (projectId: string) => Promise<string | null>;
  save: (data: ActivityData) => Promise<unknown>;
  onError: (error: unknown) => void;
}) {
  return async (input: ActivityInput) => {
    try {
      const spaceId = input.spaceId ?? (input.projectId ? await dependencies.findProjectSpace(input.projectId) : null);
      if (!spaceId) throw new Error("Activity log requires a space");
      await dependencies.save({
        spaceId,
        actorId: input.actorId,
        projectId: input.projectId ?? null,
        type: input.type,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        title: input.title ?? null,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        beforeData: input.beforeData ? JSON.stringify(input.beforeData) : null,
        afterData: input.afterData ? JSON.stringify(input.afterData) : null,
      });
    } catch (error) {
      dependencies.onError(error);
    }
  };
}
