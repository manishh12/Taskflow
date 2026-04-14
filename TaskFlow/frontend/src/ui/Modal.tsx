import React, { useEffect } from "react";
import { Button } from "./Button";

export function Modal({
  title,
  children,
  onClose,
  footer
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-fg/25 p-4 sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[min(90dvh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-soft"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tf-modal-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <h2 id="tf-modal-title" className="text-lg font-semibold text-fg">
            {title}
          </h2>
          <Button variant="ghost" size="sm" className="shrink-0 rounded-lg px-2" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-muted/50 px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
