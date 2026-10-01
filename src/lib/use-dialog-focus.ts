"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])";

export function useDialogFocus<T extends HTMLElement>(open: boolean, onClose?: () => void, onEscape?: () => void) {
  const dialogRef = useRef<T>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!open || !dialogRef.current) return;
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = focusables()[0];
    first?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        (onEscapeRef.current ?? onCloseRef.current)?.();
        return;
      }
      if (event.key !== "Tab") return;
      const current = focusables();
      if (current.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const firstElement = current[0];
      const lastElement = current[current.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };
    dialog.addEventListener("keydown", handleKeyDown);
    return () => {
      dialog.removeEventListener("keydown", handleKeyDown);
      restoreRef.current?.focus();
      restoreRef.current = null;
    };
  }, [open]);

  return dialogRef;
}
