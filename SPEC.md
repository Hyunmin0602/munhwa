# Munhwa 기술 사양

상태: 운영 기준
최종 갱신: 2026-10-18

## 1. 제품 범위

`mungwa/`가 실제 제품 애플리케이션이다. 워크스페이스 루트의 Vite React 앱은 별도 샘플이며 제품 기능의 정본이 아니다.

제품은 사업, 칸반, 일정, 아카이브, 회의록, 초대와 공개 링크를 제공하는 Next.js App Router 서비스다.
알림은 앱 안에서 제공한다. 유형은 카드 댓글 멘션, 업무 배정, 마감 임박·초과, 회의록 공유, 가입 승인이다. 사용자는 알림함에서 읽음 상태를 관리하고 알림 유형별 수신을 끌 수 있다. 마감 알림은 매일 예약 작업으로 생성한다.

## 2. 런타임과 저장소

- Next.js 16 App Router, React 19, TypeScript strict mode
- Prisma 7 + `@prisma/adapter-libsql`
- Prisma의 `sqlite` provider는 libSQL 호환을 위한 설정이며 운영 데이터는 외부 Turso/libSQL에 저장한다.
- `TURSO_DATABASE_URL`과 `TURSO_AUTH_TOKEN`이 없거나 Turso URL이 아니면 시작하지 않는다.
- `DATABASE_URL`, `LIBSQL_AUTH_TOKEN`, `file:` SQLite URL은 지원하지 않는다.
- 운영 DB에 로컬 SQLite 폴백을 사용하지 않는다.
- 인증은 Auth.js, 요청 제한은 Upstash Redis를 사용한다.

## 3. 권한 경계

- 최종 인증·권한 판단은 서버 API와 DB에서 수행한다.
- 세션에는 사용자 식별자만 신뢰하고 관리자·사업 멤버 상태는 요청 시 조회한다.
- 신규 계정은 `User.registrationStatus = "PENDING"`으로 생성하며 로그인할 수 없다. 해당 Space의 `SPACE_ADMIN` 승인 후 `APPROVED`로 전환하고 `SpaceMember`에 추가한다. 반려된 대기 계정은 제거해 같은 이메일로 재신청할 수 있다.
- `User.role = "admin"`은 전체 시스템 관리자(`ADMIN`)로 고정한다.
- `SPACE_ADMIN`은 전역 User role이 아니라 `Space.adminUserId` 관계에서 파생되는 Space 단위 권한이다.
- `Project.ownerId`는 사업 관리자 1명의 정본이며, `ProjectMember.role = "owner"`는 이전 기간 호환 필드다.
- `Project.isArchived = true`인 기록용 사업은 내용 변경을 금지한다. `Project.accessScope = "MEMBERS"`(기본값)이면 지정된 사업 구성원만 읽을 수 있고, `"SPACE"`이면 해당 Space 구성원 모두 읽을 수 있다. 기록용 여부와 열람 범위는 프로젝트 API 및 통합 API에서 동일하게 적용한다.
- 계정 탈퇴는 User 레코드와 이메일을 보존하고 `registrationStatus = "WITHDRAWN"`, 비밀번호 제거로 로그인과 동일 이메일 재가입을 차단한다. 작성자 관계와 기존 업무 기록은 그대로 유지한다. 탈퇴 사용자가 Space 관리자 또는 사업 소유자인 경우 권한 이전 후 탈퇴할 수 있다.
- `SpaceMember`는 사용자의 Space 소속을 표현하고, `Project.spaceId`는 모든 사업의 조직 경계를 보장한다.
- 칸반 업무 담당자 후보는 해당 사업 구성원, 해당 Space의 승인된 구성원, 사업 소유자와 Space 관리자다. 다른 Space 사용자나 승인 대기 사용자는 배정할 수 없다.
- 외부 공유 API는 `EXTERNAL` 게시물의 읽기 전용 경로만 제공한다.
- 비참여자 응답에는 칸반, 일정, 내부 아카이브 상세를 포함하지 않는다.
- 알림은 수신 사용자 본인만 조회·수정할 수 있다. 알림 링크의 대상 API에서도 기존 프로젝트 권한을 다시 검사한다.
- 댓글 멘션 후보와 서버 허용 대상은 해당 사업 구성원과 사업 소유자로 제한한다. 서버에서 대상을 재검증하며 작성자 자신에게는 알림을 만들지 않는다.

권한 계층은 다음과 같다.

```text
ADMIN
└── Space
  ├── SPACE_ADMIN 1명
  └── Project
    ├── ownerId 1명
    └── ProjectMember 여러 명
```

기존 `culture-sports` 단일 공간은 첫 번째 Space로 이전하며, `SpaceAdministration`은 마이그레이션 기간 동안만 호환용으로 유지한다.

## 4. API 계약

성공 목록 응답은 다음 형태를 사용한다.

```json
{
  "items": [],
  "nextCursor": "opaque-or-null"
}
```

목록 API 정책:

- 서버 기본 limit은 30, 최대 limit은 50이다.
- 본문, 관계 전체, 이미지 원본은 목록 DTO에 포함하지 않는다.
- cursor는 서버가 생성한 opaque 값으로만 전달한다.
- 목록 정렬은 항상 고정된 보조 키를 포함한다. 예: `updatedAt + id`.
- 상세 응답과 목록 DTO를 동일하게 재사용하지 않는다.
- 사업별·통합 캘린더 조회는 마감일이 있는 칸반 카드를 읽기 전용 일정 항목으로 함께 반환한다. 원본 카드의 마감일 변경과 삭제는 다음 조회에 반영하고 별도 Event 레코드를 만들지 않는다.

오류 응답은 다음 형태를 사용한다.

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "로그인이 필요합니다."
  }
}
```

허용 오류 코드는 `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`다. 내부 DB 문구와 비밀값은 응답에 포함하지 않는다.

## 5. DB 재시도

- `withDbReadRetry`: 일시적 연결 오류가 예상되는 읽기 작업에만 사용한다.
- `withDbWrite`: 생성·수정·삭제를 단일 시도로 실행한다.
- 변경 요청을 자동 재시도하려면 먼저 idempotency key와 서버 중복 검사를 설계해야 한다.
- 기존 `withDbRetry`는 호환용이며 새 코드에서 사용하지 않는다.

## 6. 통합 API 커서

통합 API는 한 번에 하나의 유형을 페이지네이션한다: `task`, `event`, `archive`, `meeting`.

`type=all` 또는 유형이 없는 요청은 요약 화면이며 페이지네이션 대상이 아니다. 서로 다른 시간축을 가진 유형을 하나의 전역 커서로 합치지 않는다. 전역 활동 피드가 필요해지면 `Activity` 모델과 단일 복합 커서를 별도 ADR로 결정한다.

## 7. 데이터 크기 예산

- 목록 API 기본 응답은 화면에 즉시 필요한 요약 필드만 포함한다.
- 아카이브 본문은 목록에서 제외한다.
- 프로젝트와 멤버 목록은 페이지네이션한다.
- 요청 본문 기본 상한은 16 KiB이며 이미지에는 별도 바이트 상한을 적용한다.
- 새 API는 응답 필드, 기본 limit, 최대 limit, cursor 정렬 키를 문서에 함께 기록한다.
- 알림 목록 응답은 요약 DTO이며 기본 limit 30, 최대 50, 정렬 키는 `createdAt + id`다.

## 8. 변경 검증

작은 변경은 다음 순서로 검증한다.

1. 변경 영역의 가장 좁은 테스트 또는 타입 검사
2. 관련 lint
3. `npm test`
4. `npx tsc --noEmit`
5. `npm run lint`
6. `npm run build`

계획 문서는 정책을 새로 정의하지 않는다. 정책 변경은 이 문서와 ADR을 먼저 수정한 뒤 구현한다.

## 9. 활동 로그

- 성공한 사업·구성원·가입 승인/반려·탈퇴·부서/기수 설정 변경, 칸반 카드/열, 사업/부서 일정, 댓글 작성, 아카이브 문서/공유/이미지 변경을 해당 Space의 `ActivityLog`에 기록한다.
- 사업 없는 작업은 `spaceId`를 명시한다. 사업 삭제 이력은 사업 관계 없이 대상 ID와 이름을 보존한다.
- 개인 일정의 내용은 부서 활동 로그에 기록하지 않는다. 공개 범위 전환은 개인 일정의 제목·본문 없이 범위와 대상 ID만 기록한다. 새 댓글/이미지 로그에는 본문·이미지 원본·저장 URL을 포함하지 않는다.
- 활동 로그는 기존과 같이 업무 변경 후 단일 시도로 저장한다. 저장 실패는 서버 오류 로그로 보고하며 완료된 업무를 재시도하거나 실패로 응답하지 않는다.
- 관리자 감사 기록과 Space 관리자 이전 기록은 기존 전용 저장소와 조회 경로를 유지한다.
- 활동 로그 목록 `/api/space-management/logs`는 ID·유형·동작·제목·대상 유형/ID·기록 시간·사업/실행자 요약만 반환한다. 기본 limit 30, 최대 50, 정렬 키는 `createdAt + id`이며 `order=asc|desc`와 opaque cursor를 지원한다.
- 목록 필터는 `query`(제목/동작/대상 ID/사업/실행자), `type`, `action`, `actor`(이름/이메일), `project`(사업명), `from`, `to`다. 날짜는 `YYYY-MM-DD`, 한국 시간 기준 양 끝 날짜를 포함한다.
- 변경 전후 내용과 추가 정보는 `/api/space-management/logs/[logId]`에서 개별 조회한다. 목록·상세 모두 해당 Space 관리 권한과 Space 경계를 검사한다.

## 10. 통합 조회의 작업량 상한

- `/api/dashboard/integrated?type=task|event|archive|meeting`은 한 유형의 요약 항목과 `nextCursor`만 반환한다. 목록 요청에서는 필터·건수·칸반 요약을 다시 계산하지 않는다.
- 목록 기본 limit은 30, 최대 50이며 본문은 반환하지 않는다. `query`는 제목·작성자(작업은 생성자)·사업명 검색에 사용한다.
- 작업은 `dueDate + id` 오름차순(날짜 없음 우선), 일정은 `startDate + id` 오름차순, 문서·회의록은 `updatedAt + id` 내림차순이다. 커서는 유형·정렬 값·ID를 포함하며 다른 유형의 커서는 거절한다.
- `type=all` 또는 유형 생략은 요약만 반환하며 페이지네이션하지 않는다. 칸반은 DB에서 최근 작업 시각 기준 사업 3개·사업별 컬럼 3개를 선정한 뒤 컬럼별 작업 2개를 가져온다.
- `/api/dashboard/integrated?view=filters`는 사업 요약 DTO(`id`, `name`, `color`, `status`)의 별도 페이지다. 기본 30개·최대 50개, 정렬은 `updatedAt + id` 내림차순이며 `query`로 사업명을 검색한다. 첫 페이지의 태그 제안은 최대 50개이고, 제안에 없는 태그도 `tag`로 검색할 수 있다.
- 아카이브 화면은 문서·회의록의 독립 커서를 사용하고 사용자 요청 시에만 다음 페이지를 조회한다. 검색은 서버에서 수행하며 화면 전환·검색 변경 시 이전 조회를 취소한다.
- 클라이언트 자동 재시도는 GET·HEAD의 네트워크 오류와 HTTP 500·502·503·504에만 적용한다. 변경 요청·401·취소는 재시도하지 않으며 대기 중 취소도 후속 호출을 중단한다.

## 11. 아카이브 첨부와 입력 보호

- 비공개 문서와 첨부 이미지의 읽기 권한은 작성자·공동 수정자·권한 있는 관리자에게만 허용한다. 프로젝트 참여 여부만으로 첨부 이미지를 읽을 수 없다.
- 새 로컬 첨부는 `.private/archive-images`에 저장하고 API에서 권한 검사 후 제공한다. 기존 `/uploads/archive/...` URL은 인증된 호환 API로 재작성하며 정적 파일로 직접 제공하지 않는다.
- 첨부 응답은 `Cache-Control: private, no-store`를 사용한다. 첨부 API와 기존 업로드 경로는 Next 이미지 최적화의 공유 캐시 대상에서 제외한다.
- JSON의 16 KiB 기본 상한은 스트리밍 중에도 검사하고 초과 시 읽기를 취소한다. 문서 생성·수정에도 이 상한을 적용하며 제목은 200자로 제한한다.
- 이미지 파일은 최대 4 MiB, multipart 요청 전체는 최대 4 MiB + 64 KiB다. 파일 크기·허용 MIME·시그니처를 확인한 뒤 저장하며 내부 저장소 오류는 응답에 포함하지 않는다.
- 회원가입은 신규·기존 이메일과 동시 가입 충돌에 동일한 성공 응답(`201`, `{ "ok": true, "pendingApproval": true }`)을 사용한다.
- 에디터에서 첨부 썸네일 클릭은 본문 삽입만 수행한다. 파일 삭제는 별도의 삭제 버튼과 확인 절차로 수행한다.
