export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex items-center gap-3 text-faint">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent" />
        <span className="font-mono text-xs uppercase tracking-[0.3em]">
          Loading
        </span>
      </div>
    </div>
  );
}
