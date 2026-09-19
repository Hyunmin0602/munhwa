"use client";

import { AlertCircle, RotateCw } from "lucide-react";

interface Props {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}

export function ModalErrorAlert({ message, onRetry, retrying = false }: Props) {
  return (
    <div role="alert" aria-live="assertive" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
      <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 leading-5">{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} disabled={retrying} className="inline-flex shrink-0 items-center gap-1 font-semibold underline underline-offset-2 disabled:opacity-50">
          <RotateCw size={13} className={retrying ? "animate-spin" : ""} aria-hidden="true" />
          다시 시도
        </button>
      )}
    </div>
  );
}