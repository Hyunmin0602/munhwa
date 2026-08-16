# 통합 화면 구현 계획서

## 1. 목적과 범위

`/dashboard/integrated`에서 **현재 로그인 사용자가 참여한 사업**의 업무를 한 화면에 집계한다. 사용자는 사업을 오가며 칸반, 일정, 아카이브를 따로 열지 않아도 오늘의 일정, 임박한 할 일, 최근 문서를 빠르게 확인할 수 있어야 한다.

이번 범위에는 다음을 포함한다.

- 참여 사업의 칸반 작업, 일정, 아카이브/회의록 집계
- 사업, 기간, 상태, 데이터 유형 필터
- 각 항목에서 원래 사업의 상세 화면으로 이동
- 모바일과 데스크톱에서 같은 데이터와 권한 적용

이번 범위에서 제외한다.

- 비참여자에게 세부 업무를 보여 주는 전체 공개 사업 통합
- 통합 화면에서 칸반 카드, 일정, 문서를 직접 수정하는 기능
- 카테고리·태그 관리 UI
- 전체 데이터를 한 번에 무제한 조회하는 API

## 2. 권한 원칙

통합 화면은 새로운 권한 모델이 아니라 기존 사업별 권한을 집계한다.

| 대상 | 통합 화면 노출 |
| --- | --- |
| 수락된 사업 참여자 | 해당 사업의 작업, 일정, 내부 문서, 본인 비공개 문서 |
| 비참여 가입 사용자 | 통합 화면 세부 데이터 없음. 기존 요약 API만 사용 |
| 초대 대기/거절 사용자 | 데이터 없음 |
| 외부 공유 링크 사용자 | 통합 화면 접근 불가 |
| 전역 관리자 | 일반 참여자와 동일하게 본인이 참여한 사업만 기본 노출. 전체 사업 관리 뷰는 별도 요구가 생길 때 추가 |

아카이브는 기존 규칙을 그대로 적용한다.

- `PRIVATE`: 작성자 본인만 집계
- `INTERNAL`: 사업 참여자에게 집계
- `EXTERNAL`: 사업 참여자에게도 집계하되, 외부 사용자는 공유 링크에서만 읽기

서버는 요청마다 `ProjectMember` 관계를 기준으로 범위를 제한한다. 클라이언트가 보내는 `projectIds`는 필터로만 사용하고 권한 근거로 신뢰하지 않는다.

## 3. 화면 구조

### 3-1. 진입점

- 데스크톱 사이드바: `통합 화면`
- 모바일 하단 탭: `통합`
- URL: `/dashboard/integrated`
- 기본 대시보드(`/dashboard`)는 기존 사업 카드 화면을 유지한다.

### 3-2. 상단 제어 영역

1. 제목: `통합 화면`
2. 데이터 유형 탭: `전체`, `칸반`, `일정`, `아카이브`, `회의록`
3. 사업 다중 선택 필터: 기본값은 참여 중인 전체 사업
4. 기간 필터: `오늘`, `7일`, `30일`, `전체`
5. 상태 필터: 작업 상태(열/완료 여부), 사업 진행 상태
6. 정렬: `마감 임박`, `최신순`, `사업 순서`

필터는 URL 검색 파라미터로 유지한다.

```text
/dashboard/integrated?types=task,event&projects=p1,p2&range=7d&sort=due
```

새로고침, 링크 공유, 뒤로 가기에서도 동일한 조회 조건을 복원한다.

### 3-3. 본문 구성

기본 `전체` 탭은 시간 우선의 세 섹션으로 구성한다.

1. `오늘과 임박한 일정`: 오늘부터 기간 종료일까지 시작하는 일정
2. `마감이 가까운 작업`: 기한이 있고 완료 열이 아닌 작업
3. `최근 문서`: 최근 수정된 문서 및 회의록

각 항목에는 사업 색상 점, 사업명, 제목, 핵심 날짜, 상태/공개 범위만 표시한다. 설명 전문, 담당자 이메일, 문서 본문, 참여자 목록은 내려받거나 렌더링하지 않는다.

개별 탭은 동일 API의 `types` 필터를 사용하며 목록과 빈 상태만 바꾼다.

| 유형 | 최소 표시 정보 | 상세 이동 |
| --- | --- | --- |
| 작업 | 사업명, 열 이름, 제목, 담당자 이름, 마감일, 우선순위 | 해당 사업 칸반 |
| 일정 | 사업명, 제목, 시작/종료일, 종일 여부 | 해당 사업 일정 |
| 문서 | 사업명, 제목, 작성자, 수정일, 공개 범위 | 해당 아카이브 문서 |
| 회의록 | 사업명, 제목, 작성자, 수정일, 공개 범위 | 해당 회의록 문서 |

## 4. 데이터 모델 선행 작업

현재 `Project`에는 `summary`, `status`, `order`, `sharingMode`가 있으나 카테고리와 태그 관계는 없다.

### 4-1. 1차 구현

- 현행 모델만 사용한다.
- 사업 필터는 `Project.id` 기반으로 제공한다.
- 사업 진행 상태는 `Project.status` 문자열을 사용한다.
- 카테고리·태그 필터 UI는 노출하지 않는다.

### 4-2. 2차 확장: 카테고리·태그

통합 화면에 메타데이터 필터가 실제로 필요해질 때 다음 모델을 추가한다.

```prisma
model ProjectCategory {
  id       String    @id @default(cuid())
  name     String    @unique
  order    Int       @default(0)
  isActive Boolean   @default(true)
  projects Project[]
}

model ProjectTag {
  id       String       @id @default(cuid())
  name     String       @unique
  order    Int          @default(0)
  isActive Boolean      @default(true)
  projects ProjectTagOnProject[]
}

model ProjectTagOnProject {
  projectId String
  tagId     String
  project   Project    @relation(fields: [projectId], references: [id], onDelete: Cascade)
  tag       ProjectTag @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([projectId, tagId])
}
```

- `Project.categoryId`는 선택 관계로 추가한다.
- 카테고리·태그 생성, 이름 변경, 비활성화, 사업 연결은 `admin`만 가능하다.
- 집계 API는 필터된 사업 ID 목록만 먼저 구한 뒤 업무 데이터를 조회한다.

## 5. 집계 API 설계

### 5-1. 엔드포인트

```text
GET /api/dashboard/integrated
```

쿼리 파라미터:

| 이름 | 예시 | 규칙 |
| --- | --- | --- |
| `types` | `task,event,archive` | 허용값: `task`, `event`, `archive`, `meeting` |
| `projectIds` | `id1,id2` | 참여 사업과 교집합만 사용 |
| `range` | `today`, `7d`, `30d`, `all` | 기본값 `7d` |
| `status` | `planning,active` | `Project.status` 필터 |
| `cursor` | opaque cursor | 다음 페이지 조회 |
| `limit` | `20` | 기본 20, 최대 50 |

응답은 유형별 배열이 아니라 공통 타임라인 항목으로 반환한다.

```ts
type IntegratedItem = {
  id: string;
  type: "task" | "event" | "archive" | "meeting";
  project: { id: string; name: string; color: string; status: string };
  title: string;
  href: string;
  timestamp: string;
  dueDate?: string | null;
  status?: string;
  priority?: string;
  visibility?: "PRIVATE" | "INTERNAL" | "EXTERNAL";
  authorName?: string | null;
  assigneeName?: string | null;
};

type IntegratedResponse = {
  items: IntegratedItem[];
  nextCursor: string | null;
  filters: { projects: Array<{ id: string; name: string; color: string; status: string }> };
};
```

### 5-2. 서버 조회 순서

1. 세션이 없으면 `401`을 반환한다.
2. `ProjectMember`에서 현재 사용자의 사업 ID를 조회한다.
3. 요청의 `projectIds`, `status`, 향후 카테고리·태그 필터를 참여 사업 범위 안에서 적용한다.
4. 선택된 유형만 병렬 조회한다.
5. 아카이브는 `authorId = userId OR visibility != PRIVATE` 조건을 적용한다.
6. 항목을 공통 DTO로 변환하고 서버에서 정렬·커서 페이지네이션한다.
7. 최대 `limit`만 반환한다.

`/api/projects/:projectId/tasks`, `/events`, `/archive`를 클라이언트에서 여러 번 호출해 합치는 방식은 사용하지 않는다. N+1 요청, 부분 실패, 권한 경계의 중복을 피하기 위해 서버 전용 집계 엔드포인트를 둔다.

### 5-3. 인덱스

데이터 증가 전에 다음 인덱스를 추가한다.

```prisma
model ProjectMember {
  // 기존 필드
  @@index([userId, projectId])
}

model Task {
  // 기존 필드
  @@index([dueDate])
}

model Event {
  // 기존 필드
  @@index([projectId, startDate])
}

model ArchivePost {
  // 기존 필드
  @@index([projectId, kind, updatedAt])
  @@index([authorId, visibility])
}
```

## 6. 프론트엔드 구현 순서

1. `src/app/api/dashboard/integrated/route.ts`를 작성하고 권한·필터·페이지네이션을 테스트한다.
2. `src/app/dashboard/integrated/page.tsx`에 서버 데이터를 읽는 클라이언트 화면을 추가한다.
3. `src/components/IntegratedFilters.tsx`로 데이터 유형, 사업, 기간 필터를 분리한다.
4. `src/components/IntegratedTimeline.tsx`로 공통 카드 목록을 구현한다.
5. 사이드바와 모바일 하단 탭에 진입점을 추가한다.
6. 카테고리·태그 모델 도입 후 필터를 추가한다.

초기 화면은 카드 내부에서 수정하지 않는다. 상세 화면으로 이동해 기존 칸반, 일정, 아카이브 편집 경험을 유지한다.

## 7. 검증 계획

### 권한 회귀

- 참여 사업의 작업·일정·내부 문서가 표시된다.
- 다른 참여자의 비공개 문서는 목록과 API 응답 모두에서 제외된다.
- 본인 비공개 문서는 표시된다.
- 초대 대기자와 일반 가입자는 세부 항목을 조회할 수 없다.
- 외부 공유 URL만 가진 비로그인 사용자는 집계 API를 호출할 수 없다.
- 변조한 `projectIds`가 다른 사업 데이터를 반환하지 않는다.

### 필터·페이지네이션

- 유형/사업/기간 필터 조합이 URL과 결과에 일치한다.
- `limit` 초과 결과는 `nextCursor`로 이어 조회된다.
- 동일 시각 항목의 정렬 기준은 `type`, `id`로 안정화한다.
- 빈 결과와 일부 유형 조회 실패를 별도 상태로 표시한다.

### 성능·UI

- 초기 응답은 최대 50개 항목, 필요한 요약 필드만 포함한다.
- 모바일 360px와 데스크톱 1440px에서 필터와 항목 텍스트가 잘리지 않는다.
- 각 항목의 사업 색상, 사업명, 링크 대상이 일치한다.
- `tsc`, 대상 ESLint, API 권한 테스트, `git diff --check`을 통과한다.

## 8. 완료 기준

- 참여자는 하나의 화면에서 칸반, 일정, 아카이브, 회의록을 사업 경계와 함께 확인할 수 있다.
- 비참여 사업과 다른 사용자의 비공개 문서는 어떤 API 응답에도 포함되지 않는다.
- 사업·유형·기간 필터와 URL 상태가 동작한다.
- 목록의 모든 항목이 원래 상세 화면으로 정확히 이동한다.
- 목록 규모가 커져도 커서 기반으로 필요한 데이터만 조회한다.