import React from "react";

export function Label({
  children,
  htmlFor,
  className = ""
}: {
  children: React.ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={`mb-1.5 block text-sm font-medium text-fg ${className}`}>
      {children}
    </label>
  );
}

export function FieldError({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <p className="mt-1 text-sm text-danger">{children}</p>;
}

export const inputClassName =
  "w-full rounded-xl border border-border bg-surface-elevated px-3.5 py-2.5 text-sm text-fg shadow-sm placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input className={`${inputClassName} ${className}`} {...rest} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return (
    <textarea className={`${inputClassName} min-h-[88px] resize-y ${className}`} {...rest} />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", children, ...rest } = props;
  return (
    <select className={`${inputClassName} ${className}`} {...rest}>
      {children}
    </select>
  );
}
