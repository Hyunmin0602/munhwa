"use client";
import { useEffect, useState } from "react";
import { Tag, X } from "lucide-react";
import { apiFetch } from "@/lib/client-fetch";

const COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#8b5cf6"];
const NEW_CATEGORY_VALUE = "__new__";

interface Props {
  onClose: () => void;
  onCreated: (project: { id: string; name: string; description: string | null; category?: string | null; tags?: string | null; color: string }) => void;
}

export default function NewProjectModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [addingCategory, setAddingCategory] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiFetch("/api/projects")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Array<{ category?: string | null }>) => {
        if (!active) return;
        const distinct = [...new Set(data.map((p) => p.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "ko"));
        setCategories(distinct);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          category: category.trim() || null,
          tags: tagInput.split(",").map((tag) => tag.trim()).filter(Boolean),
          color,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "생성 실패. 다시 시도해주세요.");
        return;
      }

      const project = await res.json();
      onCreated(project);
    } catch {
      setError("네트워크 또는 서버 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">새 사업 만들기</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
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
              maxLength={100}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              placeholder="예: 2024 문화 축제"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">사업 소개</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={5000}
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
              placeholder="사업의 목적과 주요 내용을 입력하세요"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
            {addingCategory ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  maxLength={50}
                  autoFocus
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  placeholder="새 카테고리 이름"
                />
                <button
                  type="button"
                  onClick={() => { setAddingCategory(false); setCategory(""); }}
                  className="flex-shrink-0 px-3 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
                >
                  취소
                </button>
              </div>
            ) : (
              <select
                value={category}
                onChange={(e) => {
                  if (e.target.value === NEW_CATEGORY_VALUE) { setAddingCategory(true); setCategory(""); }
                  else setCategory(e.target.value);
                }}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-white"
              >
                <option value="">선택 안 함</option>
                {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                <option value={NEW_CATEGORY_VALUE}>+ 새 카테고리 추가</option>
              </select>
            )}
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-700"><Tag size={14} />태그</label>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              maxLength={309}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              placeholder="쉼표로 구분해 입력하세요"
            />
            <p className="mt-1 text-xs text-gray-400">예: 봄축제, 대외협력, 2026</p>
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
              {loading ? "생성 중..." : "만들기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
