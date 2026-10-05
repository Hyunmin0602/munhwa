# Munhwa 기술 사양

상태: 운영 기준
최종 갱신: 2026-09-24

## 1. 제품 범위

`mungwa/`가 실제 제품 애플리케이션이다. 워크스페이스 루트의 Vite React 앱은 별도 샘플이며 제품 기능의 정본이 아니다.

제품은 사업, 칸반, 일정, 아카이브, 회의록, 초대와 공개 링크를 제공하는 Next.js App Router 서비스다.

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
- `User.role = "admin"`은 전체 시스템 관리자(`ADMIN`)로 고정한다.
- `SPACE_ADMIN`은 전역 User role이 아니라 `Space.adminUserId` 관계에서 파생되는 Space 단위 권한이다.
- `Project.ownerId`는 사업 관리자 1명의 정본이며, `ProjectMember.role = "owner"`는 이전 기간 호환 필드다.
- `SpaceMember`는 사용자의 Space 소속을 표현하고, `Project.spaceId`는 모든 사업의 조직 경계를 보장한다.
- 외부 공유 API는 `EXTERNAL` 게시물의 읽기 전용 경로만 제공한다.
- 비참여자 응답에는 칸반, 일정, 내부 아카이브 상세를 포함하지 않는다.

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

## 8. 변경 검증

작은 변경은 다음 순서로 검증한다.

1. 변경 영역의 가장 좁은 테스트 또는 타입 검사
2. 관련 lint
3. `npm test`
4. `npx tsc --noEmit`
5. `npm run lint`
6. `npm run build`

계획 문서는 정책을 새로 정의하지 않는다. 정책 변경은 이 문서와 ADR을 먼저 수정한 뒤 구현한다.
