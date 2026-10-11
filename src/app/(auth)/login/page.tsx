"use client";
import { useState, useEffect, Suspense } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import AuthPageShell from "@/components/auth/AuthPageShell";

const INPUT_CLS =
  "h-11 w-full rounded-[6px] border border-[#E8E8EC] bg-white px-3.5 text-sm text-[#0A0A0A] outline-none transition-colors placeholder:text-[#9C9C9C] focus:border-[#6366F1] focus:ring-[3px] focus:ring-[#6366F1]/15";

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
  const registeredToast = searchParams.get("registered") === "1" ? "가입 신청이 접수되었습니다. Space 관리자의 승인 후 로그인할 수 있습니다." : "";
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
      setError("로그인 정보를 확인해주세요. 가입 승인 대기 중이라면 Space 관리자 승인 후 로그인할 수 있습니다.");
    } else {
      router.push("/dashboard/integrated");
    }
  };

  return (
    <>
      {toast && (
        <div role="status" className="fixed left-1/2 top-4 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-lg border border-[#F59E0B]/30 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-900">
          {toast}
        </div>
      )}
      <AuthPageShell>
        <div className="mb-7">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[#6B6B6B]">MEMBER ACCESS</p>
          <h1 className="text-[30px] font-bold leading-tight tracking-[-0.035em] text-[#0A0A0A]" style={{ fontFamily: '"General Sans", "DM Sans", sans-serif' }}>로그인</h1>
          <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">업무 공간에 로그인해 계속 진행하세요.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="login-email" className="mb-2 block text-sm font-medium text-[#0A0A0A]">이메일</label>
            <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className={INPUT_CLS} placeholder="name@example.com" />
          </div>
          <div>
            <label htmlFor="login-password" className="mb-2 block text-sm font-medium text-[#0A0A0A]">비밀번호</label>
            <div className="relative">
              <input id="login-password" type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" className={INPUT_CLS + " pr-12"} placeholder="비밀번호 입력" />
              <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[#9C9C9C] transition-colors hover:bg-[#FAFAFA] hover:text-[#0A0A0A] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6366F1]/20" aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 보기"}>
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && <p role="alert" className="rounded-lg border border-[#EF4444]/20 bg-[#EF4444]/5 px-3 py-2.5 text-sm leading-5 text-[#B42318]">{error}</p>}

          <button type="submit" disabled={loading} className="h-11 w-full rounded-[6px] bg-[#6366F1] px-4 text-sm font-medium text-white transition-all hover:-translate-y-px hover:bg-[#4F46E5] hover:shadow-[0_4px_12px_rgba(99,102,241,0.28)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6366F1]/25 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none">
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <p className="mt-6 border-t border-[#E8E8EC] pt-5 text-center text-sm text-[#6B6B6B]">계정이 없으신가요? <Link href="/register" className="font-medium text-[#6366F1] hover:text-[#4F46E5] hover:underline">회원가입</Link></p>
      </AuthPageShell>
    </>
  );
}
