"use client";

import { Trash2 } from "lucide-react";

type Props = { url: string; onInsert: () => void; onDelete: () => void };

export default function ArchiveImageAttachment({ url, onInsert, onDelete }: Props) {
  return (
    <div className="flex flex-shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
      <button type="button" onClick={onInsert} aria-label="첨부 이미지를 본문에 삽입" title="본문에 삽입" className="h-11 w-11">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="업로드한 첨부 이미지" className="h-full w-full object-cover" />
      </button>
      <button type="button" onClick={onDelete} aria-label="첨부 이미지 삭제" title="첨부 이미지 삭제" className="flex h-11 w-11 items-center justify-center border-l border-gray-200 text-gray-500 hover:bg-rose-50 hover:text-rose-600">
        <Trash2 size={14} />
      </button>
    </div>
  );
}
