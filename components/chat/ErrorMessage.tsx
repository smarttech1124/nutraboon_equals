export function ErrorMessage({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-ink"
    >
      <p>{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded-lg border border-danger/40 px-3 py-1.5 font-semibold text-danger hover:bg-surface"
      >
        Retry
      </button>
    </div>
  );
}
