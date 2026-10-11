"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { apiFetch } from "@/lib/client-fetch";

type Profile = {
  name: string | null;
  email: string;
  role: string;
  createdAt: string;
  cohort: { name: string } | null;
  spaceMemberships: Array<{ role: string; space: { id: string; name: string } }>;
};

export default function MyAccountPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    apiFetch("/api/me").then(async (response) => {
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? "정보를 불러오지 못했습니다.");
      setProfile(payload as Profile);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "정보를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, []);

  const withdraw = async () => {
    if (!confirm("계정을 탈퇴하시겠습니까? 작성한 일정과 업무 기록은 그대로 남으며, 이 이메일로 다시 가입할 수 없습니다.")) return;
    setDeleting(true);
    setError("");
    try {
      const response = await apiFetch("/api/me", { method: "DELETE" }, { showGlobalError: false });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? "탈퇴 처리에 실패했습니다.");
      await signOut({ callbackUrl: "/login?withdrawn=1" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "탈퇴 처리에 실패했습니다.");
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl p-4 md:p-8">
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Account</p>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">내 정보</h1>
        <p className="mt-2 text-sm text-gray-500">가입 정보와 소속 공간을 확인할 수 있습니다.</p>
      </header>
      {error && <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:p-7">
        {loading ? <p className="text-sm text-gray-500">정보를 불러오는 중입니다.</p> : profile ? (
          <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            <div><dt className="text-xs font-semibold text-gray-400">이름</dt><dd className="mt-1 text-sm font-medium text-gray-900">{profile.name || "이름 미등록"}</dd></div>
            <div><dt className="text-xs font-semibold text-gray-400">이메일</dt><dd className="mt-1 break-all text-sm font-medium text-gray-900">{profile.email}</dd></div>
            <div><dt className="text-xs font-semibold text-gray-400">기수</dt><dd className="mt-1 text-sm font-medium text-gray-900">{profile.cohort?.name ?? "미지정"}</dd></div>
            <div><dt className="text-xs font-semibold text-gray-400">가입일</dt><dd className="mt-1 text-sm font-medium text-gray-900">{new Date(profile.createdAt).toLocaleDateString("ko-KR")}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs font-semibold text-gray-400">소속 공간</dt><dd className="mt-2 flex flex-wrap gap-2">{profile.spaceMemberships.length ? profile.spaceMemberships.map(({ space, role }) => <span key={space.id} className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">{space.name} · {role === "manager" ? "공간 관리자" : "구성원"}</span>) : <span className="text-sm text-gray-500">소속 공간 없음</span>}</dd></div>
          </dl>
        ) : null}
      </section>
      <section className="mt-6 rounded-2xl border border-rose-100 bg-white p-5 md:p-6">
        <h2 className="text-sm font-semibold text-gray-900">회원 탈퇴</h2>
        <p className="mt-2 text-sm leading-6 text-gray-500">탈퇴 후 로그인할 수 없으며, 기존 작성자 표시와 업무 기록은 유지됩니다. 같은 이메일 주소로 다시 가입할 수 없습니다.</p>
        <button type="button" disabled={deleting || loading} onClick={() => void withdraw()} className="mt-4 rounded-lg border border-rose-200 px-4 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-50">{deleting ? "처리 중..." : "회원 탈퇴"}</button>
      </section>
    </div>
  );
}
