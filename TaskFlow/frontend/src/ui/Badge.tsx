import React from "react";

const tones: Record<string, string> = {
  todo: "bg-slate-100 text-slate-700 border-slate-200/80",
  in_progress: "bg-amber-50 text-amber-900 border-amber-200/80",
  done: "bg-emerald-50 text-emerald-900 border-emerald-200/80",
  overdue: "bg-red-50 text-red-900 border-red-200/80",
  low: "bg-slate-50 text-slate-600 border-slate-200/80",
  medium: "bg-sky-50 text-sky-900 border-sky-200/80",
  high: "bg-rose-50 text-rose-900 border-rose-200/80"
};

export function Badge({
  children,
  tone = "todo"
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  const t = tones[tone] ?? tones.todo;
  return (
    <span
      className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium capitalize ${t}`}
    >
      {children}
    </span>
  );
}
