"use client";

import type { ReactNode } from "react";

export default function AuthPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#FAFAFA] px-4 py-8 text-[#0A0A0A] sm:px-6">
      <main className="w-full max-w-[440px]" style={{ fontFamily: '"DM Sans", Arial, sans-serif', fontWeight: 500 }}>
        <div className="mb-6 text-center sm:mb-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#6B6B6B]">문화체육위원회</p>
        </div>
        <section className="rounded-xl border border-[#E8E8EC] bg-white px-6 py-7 sm:px-9 sm:py-9">
          {children}
        </section>
        <p className="mt-5 text-center text-xs text-[#9C9C9C]">문화체육위원회 내부 업무 시스템</p>
      </main>
    </div>
  );
}
