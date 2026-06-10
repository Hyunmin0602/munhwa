# 문화위원회 업무 시스템 — 디자인 가이드

## 색상 팔레트

| 역할 | 색상 | Tailwind |
|------|------|----------|
| Primary | Indigo 600 | `indigo-600` |
| Primary Hover | Indigo 500 | `indigo-500` |
| Success | Emerald 600 | `emerald-600` |
| Warning | Amber 600 | `amber-600` |
| Danger | Rose 500 | `rose-500` |
| 텍스트 기본 | Gray 900 | `gray-900` |
| 텍스트 보조 | Gray 500 | `gray-500` |
| 텍스트 비활성 | Gray 400 | `gray-400` |
| 배경 기본 | White | `white` |
| 배경 보조 | Gray 50 | `gray-50` |
| 테두리 | Gray 200 | `gray-200` |

---

## 버튼 시스템

### Primary (주요 액션)
- **용도**: 저장, 생성, 로그인, 회원가입, 추가
- **클래스**:
  ```
  bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl
  shadow-sm hover:shadow-md hover:-translate-y-0.5
  transition-all disabled:opacity-50 disabled:cursor-not-allowed
  disabled:shadow-none disabled:translate-y-0
  ```
- **사이즈**: `px-4 py-2.5 text-sm` (일반) / `px-3 py-1.5 text-xs` (소형)

### Secondary / Cancel (취소, 보조)
- **용도**: 취소, 돌아가기
- **클래스**:
  ```
  bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl
  hover:-translate-y-0.5 transition-all
  ```

### Outline (경계선)
- **용도**: 보조 액션, 덜 강조된 취소
- **클래스**:
  ```
  border border-gray-200 hover:border-gray-300 rounded-xl
  text-gray-600 hover:bg-gray-50 hover:-translate-y-0.5 transition-all
  ```

### Ghost / Icon (아이콘 전용)
- **용도**: 닫기, 삭제, 더보기 등 아이콘 버튼
- **클래스**:
  ```
  p-1.5 rounded-lg text-gray-400 hover:text-gray-700
  hover:bg-gray-100 transition-all
  ```

### Danger (위험 액션)
- **용도**: 삭제 (아이콘 포함)
- **클래스**:
  ```
  p-1.5 rounded-lg text-gray-400 hover:text-rose-500
  hover:bg-rose-50 hover:scale-110 transition-all
  ```

### Toggle / Tab (상태 전환)
- **용도**: 편집/미리보기 모드, 필터 탭
- **활성**:
  ```
  bg-white text-gray-900 shadow-sm rounded-lg
  ```
- **비활성**:
  ```
  text-gray-500 hover:text-gray-700 rounded-lg transition-all
  ```

---

## 상태 배지 (Badge)

| 종류 | 클래스 |
|------|--------|
| 공개 | `bg-emerald-50 text-emerald-600 rounded-full px-2 py-0.5 text-xs font-medium` |
| 비공개 | `bg-gray-100 text-gray-500 rounded-full px-2 py-0.5 text-xs font-medium` |
| 우선순위 낮음 | `bg-emerald-50 text-emerald-600` |
| 우선순위 보통 | `bg-amber-50 text-amber-600` |
| 우선순위 높음 | `bg-rose-50 text-rose-600` |

---

## 카드 / 컨테이너

```
bg-white rounded-2xl border border-gray-100 shadow-sm
hover:shadow-md hover:-translate-y-0.5 transition-all
```

### 모달
```
bg-white rounded-2xl shadow-xl max-w-md w-full
```
- 배경 오버레이: `bg-black/40` (진한) / `bg-black/30 backdrop-blur-sm` (흐린)

---

## 인풋 / 폼

### 텍스트 입력
```
w-full px-4 py-2.5 border border-gray-300 rounded-xl
focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm
```

### 텍스트에어리어
```
w-full text-sm text-gray-700 bg-gray-50 rounded-xl p-3
resize-none outline-none focus:ring-2 focus:ring-indigo-200 transition
```

### 셀렉트
```
w-full text-sm text-gray-700 bg-gray-50 rounded-xl px-3 py-2
outline-none focus:ring-2 focus:ring-indigo-200 transition border border-gray-100
```

---

## 타이포그래피

| 역할 | 클래스 |
|------|--------|
| 페이지 제목 | `text-2xl font-bold text-gray-900` |
| 섹션 제목 | `text-lg font-bold text-gray-900` |
| 카드 제목 | `text-sm font-semibold text-gray-800` |
| 본문 | `text-sm text-gray-700` |
| 보조 텍스트 | `text-sm text-gray-500` |
| 캡션 | `text-xs text-gray-400` |
| 라벨 | `text-xs font-semibold text-gray-400 uppercase tracking-wide` |

---

## 레이아웃

- **최대 너비**: `max-w-md` (모달), `max-w-2xl` (컨텐츠), `max-w-4xl` (페이지)
- **내부 여백**: `p-6` (카드), `px-5 py-4` (모달 섹션)
- **요소 간격**: `gap-3` (기본), `gap-2` (소형), `gap-4` (대형)
- **스택 간격**: `space-y-4` (폼)

---

## 애니메이션

| 효과 | 클래스 |
|------|--------|
| 호버 리프트 | `hover:-translate-y-0.5` |
| 호버 그림자 | `hover:shadow-md` |
| 버튼 강조 | `hover:scale-110` |
| 로딩 스피너 | `w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin` |
| 전환 기본 | `transition-all` |

---

## 아이콘 라이브러리

**lucide-react** 사용. 일반 크기: `size={16}`, 소형: `size={14}`, 미니: `size={12}`

---

## 접근성

- 비활성 버튼: `disabled:opacity-50 disabled:cursor-not-allowed`
- 포커스 링: `focus:ring-2 focus:ring-indigo-500`
- 그룹 호버 숨김 요소: `opacity-0 group-hover:opacity-100 transition-opacity`
