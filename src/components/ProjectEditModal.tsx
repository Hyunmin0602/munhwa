"use client";
import { useState } from "react";
import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { apiFetch } from "@/lib/client-fetch";

const COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#8b5cf6"];

interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string;
}

interface Props {
  project: Project;
  onClose: () => void;
  onUpdated: (project: Project) => void;
}

export default function ProjectEditModal({ project, onClose, onUpdated }: Props) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [color, setColor] = useState(project.color);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [members, setMembers] = useState<Array<any>>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await apiFetch(`/api/projects/${project.id}/members`);
        if (!res.ok) return setMembersLoading(false);
        const data = await res.json();
        if (mounted) setMembers(data);
      } catch {
      } finally {
        if (mounted) setMembersLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [project.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextName = name.trim();
    if (!nextName) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName, description: description.trim() || null, color }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "수정 실패. 다시 시도해주세요.");
        return;
      }

      const updatedProject = await res.json();
      onUpdated({ ...project, ...updatedProject });
    } catch {
      setError("네트워크 또는 서버 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const invite = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    setInviteLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/api/projects/${project.id}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "초대 실패");
        return;
      }
      const member = await res.json();
      setMembers((m) => [...m, member]);
      setInviteEmail("");
    } catch {
      setError("초대 중 오류가 발생했습니다.");
    } finally {
      setInviteLoading(false);
    }
  };

  const removeMember = async (id: string) => {
    if (!confirm("멤버를 삭제하시겠습니까?")) return;
    try {
      const res = await apiFetch(`/api/projects/${project.id}/members/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "삭제 실패");
        return;
      }
      setMembers((m) => m.filter((x) => x.id !== id));
    } catch {
      setError("삭제 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">사업 수정</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" title="닫기">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">사업명 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              placeholder="사업명을 입력하세요"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
              placeholder="사업 설명 (선택)"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">색상</label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-all ${
                    color === c ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : ""
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 hover:-translate-y-0.5 transition-all"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0"
            >
              {loading ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>

        <div className="mt-6 border-t pt-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">멤버 관리</h3>
          {membersLoading ? (
            <p className="text-xs text-gray-400">로딩 중...</p>
          ) : (
            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                  <div className="text-sm">
                    <div className="font-medium">{m.user.name ?? m.user.email}</div>
                    <div className="text-xs text-gray-400">{m.user.email} · {m.role}</div>
                  </div>
                  <div>
                    <button onClick={() => removeMember(m.id)} className="text-sm text-rose-500">삭제</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="이메일로 초대" className="flex-1 px-3 py-2 border rounded" />
            <button onClick={invite} disabled={inviteLoading} className="px-4 py-2 bg-indigo-600 text-white rounded">{inviteLoading ? "초대 중..." : "초대"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}