<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 작업 범위와 토큰 예산

- 제품 정본은 이 디렉터리의 `SPEC.md`다. 계획 문서는 배경과 이력 확인에만 사용하고 정책을 중복 정의하지 않는다.
- 작업 시작 시 관련 파일과 심볼을 먼저 특정한다. 전체 저장소를 읽거나 모든 계획 문서를 순회하지 않는다.
- 한 번에 주 작업 파일은 최대 5개, 파일별 최초 읽기는 최대 240줄로 제한한다. 추가 읽기는 현재 가설을 검증할 때만 한다.
- 구현 전 가설 1개와 이를 반증할 가장 싼 검증 1개를 정한다.
- 첫 편집 직후 가장 좁은 테스트, 타입 검사 또는 lint를 실행한다. 실패하면 같은 영역만 고친 뒤 같은 검증을 반복한다.
- 응답에는 변경 요약, 실행한 검증, 남은 위험만 포함한다. 전체 파일을 재출력하지 않는다.
- 목록 API와 에이전트 컨텍스트 모두 요약 DTO와 페이지네이션을 우선한다. 상세 본문과 무관한 관계 데이터는 읽지 않는다.
- 생성·수정·삭제 DB 호출에는 자동 재시도를 추가하지 않는다. 읽기에는 `withDbReadRetry`, 변경에는 `withDbWrite`를 사용한다.
- 새 오류 응답은 `{ error: { code, message } }` 계약을 사용한다.
