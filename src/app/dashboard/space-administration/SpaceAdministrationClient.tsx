"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import { ArrowLeftRight, History, LoaderCircle, ShieldCheck, UserRound } from "lucide-react";
import { apiFetch } from "@/lib/client-fetch";

type User = { id: string; name: string | null; email: string };
type Transfer = {
  id: string;
  createdAt: string;
  actor: User;
  previousAdmin: User;
  nextAdmin: User;
};

type AdministrationData = { currentAdmin: User; transfers: Transfer[] };

function userLabel(user: User) {
  return user.name?.trim() || user.email;
}

export default function SpaceAdministrationClient() {
  const router = useRouter();
  const [data, setData] = useState<AdministrationData | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch("/api/space-administration");
      const next = await response.json();
      if (!response.ok) throw new Error(next.error ?? "관리자 정보를 불러오지 못했습니다.");
      setData(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "관리자 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const transfer = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextEmail = email.trim();
    if (!nextEmail || !data) return;
    if (!confirm(`${nextEmail} 계정으로 문화체육위원회 관리자 권한을 즉시 이전하시겠습니까?\n이전 후 현재 계정의 관리자 권한은 즉시 회수됩니다.`)) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await apiFetch("/api/space-administration", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: nextEmail }),
      });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error ?? "관리자 권한 이전에 실패했습니다.");
      setSuccess(`${userLabel(next.currentAdmin)} 계정으로 권한을 이전했습니다.`);
      setEmail("");
      router.replace("/dashboard");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "관리자 권한 이전에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-gray-400"><LoaderCircle size={18} className="mr-2 animate-spin" />관리자 정보를 불러오는 중...</div>;
  }

  return (
    <main className="h-full overflow-y-auto px-4 py-6 pb-24 md:px-6 lg:px-8 lg:pb-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <p className="mb-1 text-xs text-gray-400">문화체육위원회</p>
          <h1 className="text-2xl font-bold text-gray-900">관리자 인수인계</h1>
          <p className="mt-2 text-sm leading-6 text-gray-500">현임 문화체육위원장만 후임 위원장에게 관리자 권한을 즉시 이전할 수 있습니다.</p>
        </header>

        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
        {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

        {data && <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><ShieldCheck size={20} /></div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-400">현재 문화체육위원회 관리자</p>
              <p className="mt-1 text-base font-bold text-gray-900">{userLabel(data.currentAdmin)}</p>
              <p className="mt-0.5 truncate text-sm text-gray-500">{data.currentAdmin.email}</p>
            </div>
          </div>
        </section>}

        {data && <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2"><ArrowLeftRight size={18} className="text-indigo-600" /><h2 className="text-base font-bold text-gray-900">후임 관리자 지정</h2></div>
          <form onSubmit={transfer} className="space-y-3">
            <label className="block text-sm font-medium text-gray-700" htmlFor="successor-email">후임 문화체육위원장 이메일</label>
            <input id="successor-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="등록된 계정 이메일" className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-indigo-500" />
            <p className="text-xs leading-5 text-gray-400">등록된 일반 계정만 지정할 수 있습니다. 권한은 즉시 이전되며 되돌리려면 새 관리자가 다시 이전해야 합니다.</p>
            <button type="submit" disabled={submitting || !email.trim()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-indigo-500 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:translate-y-0">
              {submitting && <LoaderCircle size={15} className="animate-spin" />}{submitting ? "이전 중..." : "관리자 권한 이전"}
            </button>
          </form>
        </section>}

        {data && <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2"><History size={18} className="text-gray-500" /><h2 className="text-base font-bold text-gray-900">최근 인수인계 기록</h2></div>
          {data.transfers.length === 0 ? <p className="py-5 text-center text-sm text-gray-400">아직 기록된 인수인계가 없습니다.</p> : <ol className="divide-y divide-gray-100">{data.transfers.map((transfer) => <li key={transfer.id} className="py-3"><div className="flex items-center gap-2 text-sm text-gray-800"><UserRound size={15} className="flex-shrink-0 text-gray-400" /><span className="truncate font-medium">{userLabel(transfer.previousAdmin)}</span><span className="text-gray-300">→</span><span className="truncate font-medium">{userLabel(transfer.nextAdmin)}</span></div><p className="mt-1 pl-6 text-xs text-gray-400">{dayjs(transfer.createdAt).format("YYYY년 M월 D일 HH:mm")} · 실행: {userLabel(transfer.actor)}</p></li>)}</ol>}
        </section>}
      </div>
    </main>
  );
}
