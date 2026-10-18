"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { useDialogFocus } from "@/lib/use-dialog-focus";

type Props = {
  title: string;
  onClose: () => void;
  onEscape?: () => void | Promise<void>;
  children: ReactNode;
  className?: string;
  onBackdropMouseDown?: () => void | Promise<void>;
};

const ModalCloseContext = createContext<((callback: () => void | Promise<void>) => void) | null>(null);
const CLOSE_ANIMATION_MS = 180;

export default function ModalFrame({ title, onClose, onEscape, children, className = "", onBackdropMouseDown }: Props) {
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const requestClose = useCallback((callback: () => void | Promise<void> = onClose) => {
    if (closing) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(async () => {
      try {
        await callback();
      } finally {
        setClosing(false);
        closeTimer.current = null;
      }
    }, CLOSE_ANIMATION_MS);
  }, [closing, onClose]);
  const dialogRef = useDialogFocus<HTMLDivElement>(true, requestClose, () => requestClose(onEscape ?? onClose));

  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
  }, []);

  const handleBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (onBackdropMouseDown) {
      if (event.target === event.currentTarget) requestClose(onBackdropMouseDown);
      return;
    }
    if (event.target === event.currentTarget) requestClose();
  };

  return (
    <ModalCloseContext.Provider value={requestClose}>
      <div className={`modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 ${closing ? "modal-backdrop-exit pointer-events-none" : ""}`} onMouseDown={handleBackdropMouseDown}>
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={`modal-dialog max-h-[calc(100vh-2rem)] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl ${closing ? "modal-dialog-exit" : ""} ${className}`}>
          {children}
        </div>
      </div>
    </ModalCloseContext.Provider>
  );
}

export function ModalCloseButton({ label, onClick }: { label: string; onClick: () => void | Promise<void> }) {
  const requestClose = useContext(ModalCloseContext);
  return <button type="button" aria-label={label} onClick={() => requestClose ? requestClose(onClick) : onClick()} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"><X size={17} /></button>;
}

export function ModalCloseActionButton({ onClick, children, className = "", disabled = false }: { onClick: () => void | Promise<void>; children: ReactNode; className?: string; disabled?: boolean }) {
  const requestClose = useContext(ModalCloseContext);
  return <button type="button" disabled={disabled} onClick={() => requestClose ? requestClose(onClick) : onClick()} className={className}>{children}</button>;
}
