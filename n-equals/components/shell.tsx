import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {description && <p className="mt-1 text-muted">{description}</p>}
      </div>
      {actions}
    </header>
  );
}

export function NotAllowed() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-8">
      <h1 className="text-xl font-bold text-ink">Not available for your role</h1>
      <p className="mt-1 text-muted">
        Ask a super administrator if you need access to this part of n-equals.
      </p>
    </div>
  );
}

/** A GET search form; submitting starts again at page 1. */
export function SearchForm({ q, label }: { q: string; label: string }) {
  return (
    <form className="flex gap-2" role="search">
      <label htmlFor="q" className="sr-only">
        {label}
      </label>
      <input
        id="q"
        name="q"
        type="search"
        defaultValue={q}
        placeholder={label}
        className="min-h-10 w-full max-w-sm rounded-lg border border-line bg-surface px-3 text-ink"
      />
      <button
        type="submit"
        className="min-h-10 rounded-lg border border-line px-4 text-sm font-semibold text-ink hover:bg-subtle"
      >
        Search
      </button>
    </form>
  );
}
