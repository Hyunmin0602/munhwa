## 문화체육위원회 업무 시스템

사업별 칸반, 일정, 문서와 회의록을 관리하는 내부 업무 시스템입니다.

## 외부 데이터베이스 설정

모든 업무 데이터는 공유 외부 libSQL/Turso 데이터베이스에 저장합니다. 로컬 SQLite 데이터베이스는 지원하지 않습니다.

1. `.env.example`을 참고하여 `.env`에 `DATABASE_URL`과 `TURSO_AUTH_TOKEN`을 설정합니다.
2. 외부 데이터베이스에 마이그레이션을 적용합니다.

```bash
npx prisma migrate deploy
```

기존 `prisma/dev.db`에 데이터가 있다면 외부 DB URL과 토큰을 설정한 뒤, 데이터 이전을 별도로 수행한 후에 로컬 파일을 폐기해야 합니다. 데이터베이스 자격 증명은 저장소에 커밋하지 않습니다.

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
