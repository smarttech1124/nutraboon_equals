export function LoadingIndicator() {
  return (
    <div className="flex justify-start" role="status">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-subtle px-4 py-3">
        <span className="sr-only">Nutraboom Equals is typing…</span>
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            aria-hidden="true"
            className="h-2 w-2 animate-bounce rounded-full bg-muted motion-reduce:animate-none"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
