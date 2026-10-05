## 문화체육위원회 업무 시스템

사업별 칸반, 일정, 문서와 회의록을 관리하는 내부 업무 시스템입니다.

## 외부 데이터베이스 설정

모든 업무 데이터는 공유 외부 libSQL/Turso 데이터베이스에 저장합니다. 로컬 SQLite 데이터베이스는 지원하지 않습니다.

1. `.env.example`을 참고하여 `.env.local`에 `TURSO_DATABASE_URL`과 `TURSO_AUTH_TOKEN`을 설정합니다.
2. 외부 데이터베이스에 마이그레이션을 적용합니다.

현재 프로젝트는 Turso/libSQL 단일 저장소만 사용하며 로컬 SQLite로 동작하지 않습니다. 기존 원격 DB의 migration history가 없는 환경은 아래 baseline 절차를 사용합니다.

```bash
npx tsx scripts/baseline-libsql.ts
```

로컬 `prisma/dev.db`와 `DATABASE_URL` fallback은 지원하지 않습니다. 데이터베이스 자격 증명은 저장소에 커밋하지 않습니다.

### 기존 외부 DB의 마이그레이션 이력 복구

Prisma 7의 SQLite provider와 libSQL adapter 조합에서는 Prisma CLI가 `libsql://` URL을 직접 `migrate deploy` 대상으로 처리하지 못할 수 있습니다. 기존 외부 DB에 테이블은 있지만 `_prisma_migrations` 이력이 없는 경우에만 아래 일회성 baseline 도구를 사용합니다.

```bash
npx tsx scripts/baseline-libsql.ts
```

이 도구는 기존 데이터를 삭제하지 않고 현재 스키마를 baseline으로 등록합니다. `_prisma_migrations` 테이블이 이미 있으면 재실행을 거부합니다. 운영 적용 전 백업과 원격 테이블 상태를 확인해야 합니다.

### 화면 구성

- 데스크톱에서는 대시보드에서 참여 사업 목록을 확인합니다.
- 모바일과 태블릿에서 `/dashboard`로 접근하면 통합 화면이 기본으로 열립니다.
- 모바일 하단 탭은 `통합`, `사업`, `더보기`로 구성됩니다.
- `사업` 탭에서는 참여 중인 사업 목록을 확인하고, 선택한 사업의 칸반 화면으로 이동할 수 있습니다.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
