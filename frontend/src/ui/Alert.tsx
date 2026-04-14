import React from "react";

export function Alert({
  variant = "error",
  children
}: {
  variant?: "error" | "info";
  children: React.ReactNode;
}) {
  const cls =
    variant === "error"
      ? "border-danger/25 bg-danger/5 text-danger"
      : "border-border bg-surface-muted text-fg-muted";
  return (
    <div className={`rounded-xl border px-3.5 py-3 text-sm ${cls}`} role="alert">
      {children}
    </div>
  );
}
