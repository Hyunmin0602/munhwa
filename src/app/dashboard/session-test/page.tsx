"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-fetch";

export default function SessionTestPage() {
  const [status, setStatus] = useState("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/api/session-check");
        const data = await res.json();
        setStatus(res.ok ? "ok" : "error");
        setMessage(data.ok ? "세션과 DB 연결이 정상입니다." : "세션이 없거나 DB 연결이 실패했습니다.");
      } catch (error) {
        setStatus("error");
        setMessage("요청 실패: 로그인으로 이동하거나 오류 토스트가 표시됩니다.");
      }
    })();
  }, []);

  return (
    <div className="p-8 space-y-4">
      <h1 className="text-xl font-semibold">세션/DB 상태 테스트</h1>
      <p className="text-sm text-gray-600">이 페이지는 세션 유효성 검사를 직접 확인하기 위한 간단한 테스트 화면입니다.</p>
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm font-medium">상태: {status}</p>
        <p className="mt-2 text-sm text-gray-600">{message}</p>
      </div>
    </div>
  );
}
