"use client";

import type { MouseEvent, ReactNode } from "react";
import { X } from "lucide-react";
import { useDialogFocus } from "@/lib/use-dialog-focus";

type Props = {
  title: string;
  onClose: () => void;
  onEscape?: () => void;
  children: ReactNode;
  className?: string;
  onBackdropMouseDown?: (event: MouseEvent<HTMLDivElement>) => void;
};

export default function ModalFrame({ title, onClose, onEscape, children, className = "", onBackdropMouseDown }: Props) {
  const dialogRef = useDialogFocus<HTMLDivElement>(true, onClose, onEscape);
  const handleBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (onBackdropMouseDown) {
      onBackdropMouseDown(event);
      return;
    }
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={handleBackdropMouseDown}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={`max-h-[calc(100vh-2rem)] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl ${className}`}>
        {children}
      </div>
    </div>
  );
}

export function ModalCloseButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" aria-label={label} onClick={onClick} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"><X size={17} /></button>;
}
