"use client";
import { useState, useEffect, Suspense } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

const INPUT_CLS =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-100";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const registeredToast = searchParams.get("registered") === "1" ? "가입이 완료되었습니다! 로그인하세요." : "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(registeredToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("이메일 또는 비밀번호가 올바르지 않습니다.");
    } else {
      router.push("/dashboard/integrated");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 sm:px-6 lg:px-10">
      {/* Toast */}
      {toast && (
        <div className="fixed left-1/2 top-5 z-50 -translate-x-1/2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white shadow-lg animate-fade-in">
          {toast}
        </div>
      )}

      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm lg:grid-cols-[0.9fr_1.1fr]">
          <section className="hidden min-h-[560px] bg-indigo-600 p-10 text-white lg:flex lg:flex-col lg:justify-between">
            <div>
              <p className="text-sm font-semibold tracking-wide">문화체육위원회</p>
              <h1 className="mt-24 max-w-sm text-4xl font-bold leading-tight">대한 업무 시스템<br /></h1>
              <p className="mt-5 max-w-sm text-sm leading-7 text-indigo-100">다시 만나서 반가워요<br/> 업무 공간에 로그인하세요.</p>
            </div>
            <p className="text-xs text-indigo-100">권한이 확인된 구성원만 접근할 수 있습니다.</p>
          </section>

          <section className="flex min-h-[560px] items-center bg-white px-6 py-10 sm:px-12 lg:px-16">
            <div className="w-full max-w-md">
              <div className="mb-10">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 lg:hidden">문화체육위원회</p>
                <h2 className="mt-2 text-2xl font-bold text-gray-900"></h2>
                <p className="mt-2 text-sm leading-6 text-gray-500"></p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">이메일</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className={INPUT_CLS}
                    placeholder="name@example.com"
                  />
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between"><label className="text-sm font-medium text-gray-700">비밀번호</label></div>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className={INPUT_CLS + " pr-12"}
                      placeholder="비밀번호 입력"
                    />
                    <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 보기"}>
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {error && <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>}

                <button type="submit" disabled={loading} className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-indigo-500 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none">
                  {loading ? "로그인 중..." : "로그인"}
                </button>
              </form>

              <p className="mt-8 text-center text-sm text-gray-500">계정이 없으신가요? <Link href="/register" className="font-medium text-indigo-600 hover:underline">회원가입</Link></p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
