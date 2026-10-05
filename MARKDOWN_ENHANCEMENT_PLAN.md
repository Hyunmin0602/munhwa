# 마크다운 HTML·레이아웃·이미지 확장 구현 계획

작성일: 2026-09-13

## 1. 목표

현재 아카이브는 일반 Markdown(GFM)과 이미지 URL 문법만 지원한다. 이를 Notion을 참고한 문서 편집 경험으로 확장한다.

1. Markdown 본문에서 안전한 HTML을 사용할 수 있어야 한다.
2. 콘텐츠를 데스크톱 2열, 모바일 1열로 자연스럽게 배치할 수 있어야 한다.
3. URL 복사 없이 이미지 파일을 직접 첨부할 수 있어야 한다.
4. 이미지는 크기, 정렬, 캡션을 지정할 수 있어야 한다.
5. 편집 미리보기와 외부 공개 링크가 같은 결과를 렌더링해야 한다.
6. HTML 허용으로 인한 XSS, 위험 링크, 원격 리소스 악용을 차단해야 한다.

## 2. 현재 상태

- 편집기는 텍스트 영역 기반 Markdown 편집기다.
- `react-markdown`, `remark-gfm`, `remark-breaks`, `rehype-highlight`로 본문을 렌더링한다.
- 이미지 도구 버튼은 `![이미지](https://이미지-url)` 형식만 삽입한다.
- HTML 원문은 렌더링하지 않는다.
- 파일 업로드 API 및 이미지 저장소가 없다.
- 편집 미리보기와 공개 링크는 별도의 `ReactMarkdown` 사용 지점으로 렌더링한다.

## 3. 범위와 비범위

### 이번 구현 범위

- 안전하게 제한된 HTML 태그·속성 렌더링
- 2열/1열 레이아웃 템플릿 삽입
- 이미지 업로드, URL 삽입, 이미지 정렬·폭·캡션
- 미리보기/공개 링크 렌더러 통일
- 이미지 파일 형식·용량 검증 및 삭제 정책

### 이번 구현에서 제외

- 완전한 블록 기반 WYSIWYG 에디터 전환
- 문서 내 이미지 드래그 앤 드롭으로 위치를 시각적으로 재배치하는 캔버스 UI
- PDF, 동영상, 압축 파일 같은 일반 첨부 파일
- 공동 편집, 버전 히스토리, 댓글

## 4. 권장 콘텐츠 문법

직접 HTML을 작성할 수 있게 하되, 자주 쓰는 형식은 버튼으로 템플릿을 삽입한다.

### 4-1. 2열 레이아웃

```html
<section class="md-grid md-grid--two">
  <div>

  왼쪽 내용

  </div>
  <div>

  오른쪽 내용

  </div>
</section>
```

렌더링 규칙:

- 데스크톱(`768px` 이상): 동일 폭 2열, 간격 `24px`
- 모바일: 자동으로 1열 세로 배치
- 열 안에서는 일반 Markdown(제목, 목록, 링크, 이미지)을 계속 작성 가능
- 2열 안에 다시 2열을 중첩하는 것은 첫 버전에서 허용하지 않음

### 4-2. 이미지 + 캡션

```html
<figure class="md-figure md-figure--center md-figure--medium">
  <img src="https://..." alt="행사 현장 사진" />
  <figcaption>2026 문화제 운영 현장</figcaption>
</figure>
```

지원 클래스:

| 분류 | 값 | 동작 |
| --- | --- | --- |
| 정렬 | `md-figure--left`, `md-figure--center`, `md-figure--right` | 이미지 블록 정렬 |
| 폭 | `md-figure--small`, `md-figure--medium`, `md-figure--large`, `md-figure--full` | 25%, 50%, 75%, 100% 최대 폭 |
| 스타일 | `md-figure--rounded` | 모서리 둥글게 처리 |

- 모바일에서는 모든 이미지를 최대 폭 100%로 렌더링해 가로 넘침을 막는다.
- `alt`는 접근성을 위해 필수 입력으로 유도한다.
- 캡션은 선택 항목이다.

### 4-3. 기본 이미지 Markdown 호환

기존 문서의 `![대체 텍스트](이미지 URL)` 문법은 그대로 유지한다.

- 업로드 후에는 기본적으로 이 문법을 삽입한다.
- 정렬/폭/캡션을 지정할 때만 `figure` 템플릿으로 변환한다.
- 기존 공개 문서에는 데이터 마이그레이션이 필요 없다.

## 5. 보안 설계

HTML을 원문 그대로 브라우저에 전달하지 않는다.

### 5-1. 렌더링 파이프라인

```text
Markdown 원문
  → remark-gfm / remark-breaks
  → rehype-raw (HTML을 AST로 해석)
  → rehype-sanitize (허용 목록 외 제거)
  → rehype-highlight
  → React 렌더링
```

- `rehype-raw`만 단독으로 추가하는 것은 금지한다.
- 허용 목록 기반 정화가 HTML 해석 직후 항상 적용되어야 한다.
- 편집 미리보기, 로그인 후 문서 상세, 외부 공개 링크 모두 같은 플러그인/정화 정책을 사용한다.

### 5-2. 허용 태그

`div`, `section`, `span`, `p`, `br`, `hr`, `blockquote`, `details`, `summary`, `figure`, `figcaption`, `img`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `sup`, `sub` 및 Markdown이 생성하는 표준 텍스트 태그.

### 5-3. 허용 속성

- 공통: `className`, `id`, `title`
- 링크: `href`, `title`, `target`, `rel`
- 이미지: `src`, `alt`, `width`, `height`, `loading`
- 테이블: `colspan`, `rowspan`, `align`
- 접근성: `aria-*`

### 5-4. 명시적 차단

- `script`, `style`, `iframe`, `object`, `embed`, `form`, `input`, `button`, `svg`, `math`
- 모든 이벤트 속성: `onload`, `onclick` 등
- `style` 원문 속성: 첫 버전에서는 차단
- `javascript:`, `data:`, `vbscript:` URL
- 임의의 외부 CSS 클래스: `md-*`로 시작하는 레이아웃/이미지 클래스만 허용

`style` 속성을 차단하는 이유는 임의 위치 고정, 화면 가림, 외부 리소스 호출, 레이아웃 붕괴를 예방하기 위함이다. 자유도는 사전 정의한 클래스 조합으로 제공한다.

### 5-5. 외부 링크 보안

- 외부 링크는 `target="_blank"`일 때 항상 `rel="noopener noreferrer"`를 부여한다.
- 이미지와 링크 URL은 `https:`와 앱 자체의 업로드 URL만 허용한다.
- HTTP 이미지는 혼합 콘텐츠 및 추적 위험 때문에 차단 또는 경고 후 `https` 입력을 유도한다.

## 6. 이미지 첨부 설계

### 6-1. 저장 방식 결정

이미지 파일은 DB에 Base64로 저장하지 않는다. DB 용량 증가와 응답 성능 저하를 막기 위해 객체 스토리지를 사용한다.

권장 구성:

| 구성요소 | 역할 |
| --- | --- |
| Vercel Blob 또는 S3 호환 객체 스토리지 | 실제 이미지 파일 저장 |
| `ArchiveImage` DB 모델 | 파일 소유자, 문서, URL, 경로, 크기, 타입 기록 |
| 업로드 API | 로그인·권한·형식·용량 검증, 서명 URL 또는 서버 업로드 처리 |
| 삭제 API | 문서 권한 확인 후 객체 스토리지와 메타데이터 함께 삭제 |

배포 환경이 Vercel이면 Vercel Blob을 기본 권장한다. Turso/SQLite는 이미지 본문 저장소로 사용하지 않는다.

### 6-2. `ArchiveImage` 데이터 모델 초안

```prisma
model ArchiveImage {
  id          String   @id @default(cuid())
  postId      String?
  uploaderId  String
  storageKey  String   @unique
  url         String
  mimeType    String
  byteSize    Int
  width       Int?
  height      Int?
  createdAt   DateTime @default(now())

  post     ArchivePost? @relation(fields: [postId], references: [id], onDelete: SetNull)
  uploader User         @relation(fields: [uploaderId], references: [id], onDelete: Cascade)

  @@index([postId])
  @@index([uploaderId, createdAt])
}
```

초기 업로드 중 문서 저장 전 상태를 지원하기 위해 `postId`는 선택값으로 둔다. 문서 저장 시 본문에서 해당 업로드 URL을 찾아 연결하거나, 업로드 응답의 `imageId`를 이용해 연결한다.

### 6-3. 업로드 제한

| 항목 | 기준 |
| --- | --- |
| 허용 형식 | JPEG, PNG, WebP, GIF |
| 제외 형식 | SVG, HTML, PDF, HEIC, 실행 파일 |
| 단일 파일 최대 크기 | 4MB |
| 문서당 최대 파일 수 | 30개 (초기값) |
| 업로드 권한 | 문서 작성/수정 가능 사용자와 `space_admin` |
| 삭제 권한 | 업로더 또는 `space_admin`; 문서에서 제거된 고아 파일은 정리 대상 |

서버 경유 업로드는 Vercel 함수 요청 본문 제한을 고려해 4MB로 제한한다. 10MB 이상 업로드가 필요해지면 Vercel Blob 브라우저 직접 업로드로 전환하고, 완료 콜백에서 파일 검증을 추가한다. 서버는 파일 확장자뿐 아니라 MIME 타입과 실제 바이너리 시그니처를 함께 검증한다. 이미지 리사이즈/EXIF 제거는 저장소 또는 서버 이미지 처리 도입 시 별도 적용한다.

## 7. 편집기 UX 계획

### 7-1. 도구 모음

기존 도구 모음에 아래 항목을 추가한다.

| 버튼 | 동작 |
| --- | --- |
| 이미지 업로드 | 파일 선택 → 업로드 → 기본 Markdown 이미지 삽입 |
| URL 이미지 | 이미지 URL 입력 → 기본 Markdown 이미지 삽입 |
| 2열 | 커서 위치에 비어 있는 2열 HTML 템플릿 삽입 |
| 이미지 레이아웃 | URL/대체텍스트/폭/정렬/캡션 입력 → figure 템플릿 삽입 |
| HTML 도움말 | 사용 가능한 태그·클래스와 예시를 사이드 패널로 표시 |

### 7-2. Notion 참고 방식

- 텍스트 편집 기반은 유지해 기존 문서를 보존한다.
- 새 블록 메뉴를 과도하게 만들지 않고, `2열`, `이미지`처럼 자주 쓰는 배치만 빠른 템플릿으로 제공한다.
- 템플릿 삽입 뒤 사용자가 각 열 내부를 직접 Markdown으로 채운다.
- 미리보기에서는 실제 모바일/데스크톱 반응형 결과를 즉시 확인한다.

### 7-3. 오류 처리

- 업로드 실패: 실패 사유와 재시도 버튼 표시, 본문은 변경하지 않음
- 지원하지 않는 파일: 선택 즉시 형식/크기 안내
- 연결이 끊긴 이미지: 미리보기에서 대체 텍스트와 오류 상태 표시
- 저장되지 않은 업로드: 문서를 저장하지 않고 페이지를 이탈하면 고아 파일 정리 대상으로 표시

## 8. 구현 단계

### Phase M1 — 안전한 HTML 렌더러 통일

1. `rehype-raw`, `rehype-sanitize` 설치
2. 공통 `MarkdownRenderer` 컴포넌트 생성
3. 보안 허용 목록 및 외부 링크 처리 정의
4. 편집 미리보기와 공개 링크 페이지를 공통 렌더러로 교체
5. 기존 GFM, 코드 하이라이트, 이미지 Markdown 회귀 테스트

완료 기준:
- 허용된 2열/figure HTML이 양쪽 화면에서 같은 모습으로 렌더링
- 스크립트·이벤트 속성·위험 URL이 렌더링되지 않음

### Phase M2 — 2열·이미지 레이아웃 템플릿

1. 전역 CSS에 `md-grid`, `md-figure` 반응형 클래스 추가
2. 편집기 도구 모음에 2열 템플릿 버튼 추가
3. 이미지 레이아웃 입력 UI 추가
4. HTML 도움말 패널 추가

완료 기준:
- 2열 버튼으로 생성한 문서가 모바일에서 1열로 전환
- 작은/중간/큰/전체 폭과 왼쪽/가운데/오른쪽 이미지 배치 가능

### Phase M3 — 이미지 파일 첨부

1. 객체 스토리지 공급자 확정 및 환경 변수 설정
2. `ArchiveImage` Prisma 모델 및 마이그레이션 추가
3. 업로드/삭제 API와 권한 검증 구현
4. 파일 선택 UI, 업로드 진행 상태, 본문 삽입 구현
5. 문서 삭제 시 연결된 이미지 정리, 고아 이미지 정리 전략 추가

완료 기준:
- 4MB 이하 허용 이미지가 업로드 후 본문에 삽입
- 일반 사용자는 권한 없는 문서에 업로드/삭제 불가
- `space_admin`은 타인 문서의 연결 이미지도 관리 가능

### Phase M4 — 검증 및 운영 준비

1. XSS 허용 목록 회귀 테스트
2. 공개 링크·내부 미리보기 시각 비교
3. 모바일/데스크톱 반응형 확인
4. 업로드 실패, 권한 없음, 문서 삭제, 링크 폐기 시나리오 테스트
5. 업로드 파일 수/용량 모니터링 기준 문서화

## 9. 테스트 시나리오

### 보안

- `<script>alert(1)</script>`가 실행·표시되지 않는다.
- `<img onerror="...">` 이벤트가 제거된다.
- `<a href="javascript:...">` 링크가 제거된다.
- 허용되지 않은 `style`, `iframe`, `svg`가 렌더링되지 않는다.
- 안전한 `section`, `figure`, `img`, `figcaption`, 표는 유지된다.

### 권한

- 일반 사업 참여자는 접근 가능한 문서에만 이미지를 업로드한다.
- `space_admin`은 타인 문서와 연결된 이미지를 수정/삭제할 수 있다.
- 외부 공개 링크 사용자는 업로드 API와 내부 문서 목록에서 `401` 또는 `403`을 받는다.

### UI

- 데스크톱에서 2열, 모바일에서 1열로 표시된다.
- 긴 이미지와 긴 캡션이 화면을 넘지 않는다.
- Markdown 이미지 문법과 HTML figure가 모두 공개 링크에 보인다.
- 이미지 업로드 실패가 본문을 손상시키지 않는다.

## 10. 사전 결정이 필요한 운영 항목

1. 이미지 저장소: Vercel Blob 사용 여부 (권장) 또는 기존 S3/R2 버킷 여부
2. 월별 저장 용량/전송량 예산
3. GIF 업로드 허용 여부 (초기 허용안, 용량 부담 시 WebP/JPEG/PNG만 허용)
4. 문서에서 삭제한 이미지를 즉시 삭제할지, 7일 유예 후 정리할지

권장 초기 결정:
- Vercel Blob
- JPEG/PNG/WebP/GIF, 파일당 4MB
- 문서에서 분리된 이미지는 7일 후 정리
- 이미지 파일만 지원하고 일반 파일 첨부는 후속 작업
