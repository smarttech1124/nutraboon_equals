export const SUGGESTED_PROMPTS = [
  "What's the nutrition in an orange?",
  "Help me plan meals for my family.",
  "I have ₦2,000. What can I cook?",
  "What can I make with rice and beans?",
  "Plan my children's school lunchboxes.",
] as const;

/**
 * The two ways in the review asked for (ADR-058). Each starts a conversation;
 * Equals then asks what is in the kitchen, or how much there is to spend.
 */
export const START_MODES = [
  {
    label: "What do I have?",
    hint: "Cook with the food already in your kitchen",
    message: "What can I make with the food I already have at home?",
  },
  {
    label: "What can I afford?",
    hint: "Plan food within your budget",
    message: "Help me plan what to cook within my budget.",
  },
] as const;

export function SuggestedPrompts({ onSelect }: { onSelect: (prompt: string) => void }) {
  return (
    <div className="space-y-4">
      <ul aria-label="Start from" className="grid grid-cols-2 gap-2">
        {START_MODES.map((mode) => (
          <li key={mode.label}>
            <button
              type="button"
              onClick={() => onSelect(mode.message)}
              className="flex h-full w-full flex-col items-start rounded-xl border-2 border-brand px-3 py-2.5 text-left transition hover:bg-brand-soft"
            >
              <span className="font-semibold text-brand-text">{mode.label}</span>
              <span className="text-sm text-muted">{mode.hint}</span>
            </button>
          </li>
        ))}
      </ul>
      <SuggestedList onSelect={onSelect} />
    </div>
  );
}

function SuggestedList({ onSelect }: { onSelect: (prompt: string) => void }) {
  return (
    <ul aria-label="Suggested questions" className="flex flex-col gap-2">
      {SUGGESTED_PROMPTS.map((prompt) => (
        <li key={prompt}>
          <button
            type="button"
            onClick={() => onSelect(prompt)}
            className="w-full rounded-xl border border-line px-4 py-2.5 text-left text-ink transition hover:border-brand hover:bg-brand-soft"
          >
            {prompt}
          </button>
        </li>
      ))}
    </ul>
  );
}
