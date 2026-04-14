import React from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-foreground shadow-sm hover:opacity-95 active:scale-[0.98] disabled:opacity-50",
  secondary:
    "bg-surface-elevated text-fg border border-border shadow-sm hover:bg-surface-muted active:scale-[0.98] disabled:opacity-50",
  ghost: "text-fg-muted hover:bg-surface-muted hover:text-fg disabled:opacity-50",
  danger: "bg-danger text-danger-foreground hover:opacity-95 active:scale-[0.98] disabled:opacity-50"
};

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: "sm" | "md";
  }
) {
  const { variant = "primary", size = "md", className = "", ...rest } = props;
  const sizeCls = size === "sm" ? "text-sm px-3 py-1.5 rounded-lg" : "text-sm px-4 py-2.5 rounded-xl";
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 font-medium transition focus-visible:tf-focus ${variants[variant]} ${sizeCls} ${className}`}
      {...rest}
    />
  );
}
