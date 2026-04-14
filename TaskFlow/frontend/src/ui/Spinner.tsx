export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-fg-muted" role="status">
      <span
        className="h-4 w-4 animate-spin rounded-full border-2 border-fg-subtle border-t-accent"
        aria-hidden
      />
      <span className="text-sm">{label}</span>
    </span>
  );
}
