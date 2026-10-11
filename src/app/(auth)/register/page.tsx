"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { apiFetch } from "@/lib/client-fetch";
import AuthPageShell from "@/components/auth/AuthPageShell";

const INPUT_CLS =
  "h-11 w-full rounded-[6px] border border-[#E8E8EC] bg-white px-3.5 text-sm text-[#0A0A0A] outline-none transition-colors placeholder:text-[#9C9C9C] focus:border-[#6366F1] focus:ring-[3px] focus:ring-[#6366F1]/15";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [cohortId, setCohortId] = useState("");
  const [cohorts, setCohorts] = useState<Array<{ id: string; name: string }>>([]);
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch("/api/cohorts")
      .then(async (res) => {
        if (!res.ok) throw new Error("cohorts");
        setCohorts(await res.json());
      })
      .catch(() => setError("가입 가능한 기수 목록을 불러오지 못했습니다."));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (password.length < 12) {
      setError("비밀번호는 12자 이상이어야 합니다.");
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, cohortId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message ?? data?.error ?? "오류가 발생했습니다.");
      } else {
        router.push("/login?registered=1");
      }
    } catch {
      setError("네트워크 또는 서버 오류가 발생했습니다.");
    } finally { setLoading(false); }
  };

  const pwMatch = confirmPassword.length > 0 && password === confirmPassword;
  const pwMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <AuthPageShell>
      <div className="mb-6">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[#6B6B6B]"></p>
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.035em] text-[#0A0A0A]" style={{ fontFamily: '"General Sans", "DM Sans", sans-serif' }}>회원가입</h1>
        <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">구성원 정보를 입력해 가입을 신청하세요.</p>
      </div>
      <div className="mb-6 flex gap-3 rounded-lg border border-[#F59E0B]/25 bg-amber-50 px-3.5 py-3">
        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#F59E0B]" aria-hidden="true" />
        <p className="text-xs leading-5 text-[#6B6B6B]">가입 후 Space 관리자의 승인이 완료되면 로그인할 수 있습니다.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-5">
        <fieldset className="space-y-4">
          <legend className="mb-3 text-sm font-medium text-[#0A0A0A]"></legend>
            {/* 이름 */}
            <div>
              <label htmlFor="register-name" className="mb-2 block text-sm font-medium text-[#0A0A0A]">이름</label>
              <input
                id="register-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={50}
                autoComplete="name"
                placeholder="홍길동"
                className={INPUT_CLS}
              />
            </div>
            {/* 이메일 */}
            <div>
              <label htmlFor="register-email" className="mb-2 block text-sm font-medium text-[#0A0A0A]">이메일</label>
              <input
                id="register-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={254}
                autoComplete="email"
                className={INPUT_CLS}
                placeholder="name@example.com"
              />
            </div>
            <div>
              <label htmlFor="register-cohort" className="mb-2 block text-sm font-medium text-[#0A0A0A]">기수</label>
              <select
                id="register-cohort"
                value={cohortId}
                onChange={(e) => setCohortId(e.target.value)}
                required
                className={INPUT_CLS + " appearance-none"}
              >
                <option value="">기수를 선택해주세요</option>
                {cohorts.map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.name}</option>)}
              </select>
              {cohorts.length === 0 && <p className="mt-1.5 text-xs text-[#9C9C9C]">현재 가입 가능한 기수가 없습니다.</p>}
            </div>
        </fieldset>
        <fieldset className=" ">
          <legend className="mb-3 text-sm font-medium text-[#0A0A0A]"></legend>
            {/* 비밀번호 */}
            <div>
              <label htmlFor="register-password" className="mb-2 block text-sm font-medium text-[#0A0A0A]">비밀번호</label>
              <div className="relative">
                <input
                  id="register-password"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  className={INPUT_CLS + " pr-12"}
                  placeholder="12자 이상"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[#9C9C9C] transition-colors hover:bg-[#FAFAFA] hover:text-[#0A0A0A] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6366F1]/20"
                  aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 보기"}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {/* 비밀번호 확인 */}
            <div>
              <label htmlFor="register-password-confirm" className="mb-2 block text-sm font-medium text-[#0A0A0A]">비밀번호 확인</label>
              <div className="relative">
                <input
                  id="register-password-confirm"
                  type={showPw2 ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className={
                    INPUT_CLS +
                    " pr-12 " +
                    (pwMatch ? "border-[#10B981] focus:ring-[#10B981]/15" :
                     pwMismatch ? "border-[#EF4444] focus:ring-[#EF4444]/15" : "")
                  }
                  placeholder="비밀번호 재입력"
                />
                <button
                  type="button"
                  onClick={() => setShowPw2((v) => !v)}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[#9C9C9C] transition-colors hover:bg-[#FAFAFA] hover:text-[#0A0A0A] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6366F1]/20"
                  aria-label={showPw2 ? "비밀번호 숨기기" : "비밀번호 보기"}
                >
                  {showPw2 ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {pwMatch && <p className="mt-1.5 text-xs text-[#059669]">비밀번호가 일치합니다</p>}
              {pwMismatch && <p className="mt-1.5 text-xs text-[#EF4444]">비밀번호가 일치하지 않습니다</p>}
            </div>
        </fieldset>

            {error && <p role="alert" className="rounded-lg border border-[#EF4444]/20 bg-[#EF4444]/5 px-3 py-2.5 text-sm leading-5 text-[#B42318]">{error}</p>}

            <button
              type="submit"
              disabled={loading || pwMismatch}
              className="h-11 w-full rounded-[6px] bg-[#6366F1] px-4 text-sm font-medium text-white transition-all hover:-translate-y-px hover:bg-[#4F46E5] hover:shadow-[0_4px_12px_rgba(99,102,241,0.28)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6366F1]/25 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              {loading ? "가입 중..." : "회원가입"}
            </button>
      </form>
      <p className="mt-6 border-t border-[#E8E8EC] pt-5 text-center text-sm text-[#6B6B6B]">
            이미 계정이 있으신가요?{" "}
            <Link href="/login" className="font-medium text-[#6366F1] hover:text-[#4F46E5] hover:underline">
              로그인
            </Link>
      </p>
    </AuthPageShell>
  );
}
