export type ActivitySummary = {
  id: string;
  type: string;
  action: string;
  title: string;
  entityType: string;
  entityId: string;
  timestamp: string;
  project: { id: string; name: string } | null;
  actor: { id: string; name: string | null; email: string };
};

export type ActivityDetail = {
  id: string;
  entityType: string;
  entityId: string;
  beforeData: string | null;
  afterData: string | null;
  metadata: string | null;
};

export const activityTypes = ["일정", "칸반", "문서", "사업", "구성원", "부서", "기수"];
export const activityActions = ["생성", "수정", "삭제", "추가", "제거", "역할 변경", "가입 승인", "가입 반려", "탈퇴", "열 생성", "열 수정", "열 삭제", "댓글 작성", "이미지 업로드", "이미지 삭제", "공유 설정", "공유 해제"];

const labels: Record<string, string> = {
  title: "제목", name: "이름", description: "설명", content: "본문", category: "분류", tags: "태그", summary: "요약",
  status: "상태", color: "색상", isArchived: "기록용 사업", accessScope: "열람 범위", ownerId: "사업 관리자 ID",
  priority: "우선순위", dueDate: "마감일", columnId: "칸반 열 ID", assigneeId: "담당자 ID", startDate: "시작", endDate: "종료",
  allDay: "종일", scope: "공개 범위", projectId: "사업 ID", spaceId: "Space ID", labelId: "라벨 ID", type: "유형",
  role: "역할", userId: "사용자 ID", registrationStatus: "가입 상태", order: "순서", isActive: "활성",
  integratedStatus: "통합 상태", isIntegratedPrimary: "대표 열", taskId: "카드 ID", eventId: "일정 ID", postId: "문서 ID",
  mentionUserIds: "멘션 대상 ID", mimeType: "파일 형식", byteSize: "파일 크기", visibility: "공개 범위", kind: "문서 종류",
  deletedTaskCount: "함께 삭제된 카드 수", demotedPrimaryColumnIds: "대표 지정이 해제된 열 ID", value: "값",
};
const values: Record<string, string> = {
  PENDING: "승인 대기", APPROVED: "승인", REJECTED: "반려", WITHDRAWN: "탈퇴", MEMBERS: "사업 구성원", SPACE: "부서", PROJECT: "사업", PERSONAL: "개인",
  PRIVATE: "비공개", INTERNAL: "내부 공개", EXTERNAL: "외부 공개", BEFORE: "진행 전", IN_PROGRESS: "진행 중", DONE: "완료",
  member: "구성원", manager: "관리자", space_manager: "부서 관리자", owner: "사업 관리자", low: "낮음", medium: "보통", high: "높음", urgent: "긴급",
};
const enumFields = new Set(["status", "accessScope", "scope", "visibility", "integratedStatus", "role", "priority", "registrationStatus"]);

export function activityFieldLabel(key: string) { return labels[key] ?? key; }

export function activityData(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : { value: parsed };
  } catch { return { value: raw }; }
}

function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalized(item)]));
  return value;
}

export function activityChanges(detail: Pick<ActivityDetail, "beforeData" | "afterData">) {
  const before = activityData(detail.beforeData);
  const after = activityData(detail.afterData);
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].map((key) => ({
    key, before: before[key], after: after[key], changed: JSON.stringify(normalized(before[key])) !== JSON.stringify(normalized(after[key])),
  }));
}

export function activityTime(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(date);
}

export function activityValue(key: string, value: unknown): string {
  if (value === undefined) return "기록 없음";
  if (value === null || value === "") return "없음";
  if (typeof value === "boolean") return value ? "예" : "아니요";
  if (key === "byteSize" && typeof value === "number") return `${(value / 1024).toLocaleString("ko-KR", { maximumFractionDigits: 1 })} KB`;
  if (Array.isArray(value)) return value.length ? value.map((item) => activityValue(key, item)).join(", ") : "없음";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  if (typeof value === "string") {
    if (enumFields.has(key)) return values[value] ?? value;
    if (["dueDate", "startDate", "endDate"].includes(key)) return activityTime(value);
  }
  return String(value);
}

export function activityDateRange(days: number, now = new Date()) {
  const today = new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
  const from = new Date(new Date(`${today}T00:00:00Z`).getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  return { from, to: today };
}
