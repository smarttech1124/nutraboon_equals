/**
 * A page-level loading state (ADR-075): announced politely to screen
 * readers, with a calm placeholder that does not animate for people who ask
 * for reduced motion.
 */
export function PageLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4 py-6">
      <span className="sr-only">{label}</span>
      <div
        aria-hidden="true"
        className="h-8 w-1/2 rounded-xl bg-subtle motion-safe:animate-pulse"
      />
      <div aria-hidden="true" className="h-32 rounded-3xl bg-subtle motion-safe:animate-pulse" />
      <div aria-hidden="true" className="h-24 rounded-3xl bg-subtle motion-safe:animate-pulse" />
    </div>
  );
}
