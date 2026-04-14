import React from "react";

export function Card({
  children,
  className = ""
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-border bg-surface-elevated p-5 shadow-soft sm:p-6 ${className}`}
    >
      {children}
    </div>
  );
}
