/**
 * The hero's illustration of a conversation (ADR-070, ADR-076). It shows how
 * the assistant asks before spending a budget (CLAUDE.md §5). The messages
 * appear one after another, as in a real chat, once, with gentle fades; a
 * soft "breathing" glow follows. Nothing flashes, and people who ask for
 * reduced motion see the finished conversation at once (globals.css).
 */
export function ChatPreview() {
  return (
    <figure className="hero-chat relative mx-auto w-full max-w-md">
      <figcaption className="sr-only">
        Illustration: a conversation with the Nutraboom Equals assistant about cooking with ₦2,000.
      </figcaption>
      <div
        aria-hidden="true"
        className="hero-float absolute -top-6 -right-4 size-24 rounded-full bg-gold/70"
      />
      <div
        aria-hidden="true"
        className="hero-float-slow absolute -bottom-6 -left-6 size-32 rounded-full bg-brand/15"
      />
      <div className="relative flex flex-col gap-3 rounded-[2rem] border border-line bg-surface p-5 shadow-[0_24px_60px_-28px_rgba(38,70,83,0.55)] sm:p-6">
        <div className="flex items-center gap-3 border-b border-line pb-3">
          <span
            aria-hidden="true"
            className="inline-flex size-10 items-center justify-center rounded-full bg-brand font-display text-lg font-bold text-white"
          >
            N
          </span>
          <div>
            <p className="font-semibold text-ink">Nutraboom Equals</p>
            <p className="text-xs text-muted">Nutrition assistant</p>
          </div>
        </div>
        <p className="hero-msg ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-brand px-4 py-2.5 text-white [--d:0.3s]">
          I have ₦2,000. What can I cook tonight?
        </p>
        <p className="hero-msg max-w-[90%] rounded-2xl rounded-bl-sm bg-subtle px-4 py-2.5 text-ink [--d:1.3s]">
          Let&apos;s make the most of your ₦2,000. What ingredients do you already have at home?
        </p>
        <p className="hero-msg ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-brand px-4 py-2.5 text-white [--d:2.3s]">
          Rice, palm oil and two eggs. It&apos;s for three of us.
        </p>
        <div className="hero-msg max-w-[90%] rounded-2xl rounded-bl-sm bg-subtle px-4 py-3 text-ink [--d:3.4s]">
          <p>Great start. Here&apos;s a plan that uses what you have:</p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm">
            <li>Tomato and pepper stew with your eggs</li>
            <li>Rice cooked in palm oil, with ugu for colour and iron</li>
          </ul>
          <p className="mt-2 border-t border-line pt-2 text-sm font-semibold text-brand-text">
            Shopping list, estimated cost and what&apos;s left of ₦2,000, worked out for you.
          </p>
        </div>
      </div>
    </figure>
  );
}
