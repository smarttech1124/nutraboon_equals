import { NutritionistCardView } from "@/components/nutritionists/card";
import { ProductRecommendations } from "@/components/vendors/product-card";
import type { ListenControls } from "./MessageList";
import { OutcomeCard } from "./OutcomeCard";
import { VisualGallery } from "@/components/visuals/VisualGallery";
import { SignLanguageResponseSlot } from "@/components/sign/SignLanguageResponse";
import type { UIMessage } from "./useChat";

export function MessageBubble({
  message,
  listen,
  sign,
}: {
  message: UIMessage;
  listen?: ListenControls;
  /** Present when the person chose sign-language responses (ADR-077). */
  sign?: { latest: boolean };
}) {
  const isUser = message.role === "user";
  const playing = listen?.speakingId === message.id;
  // A reply with a structured result leads with it (ADR-051).
  const hasOutcome = !isUser && Boolean(message.outcome || message.mealPlan || message.budget);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`rounded-2xl ${
          isUser
            ? "max-w-[85%] rounded-br-sm bg-brand px-4 py-2.5 text-white"
            : hasOutcome
              ? "w-full text-ink"
              : "max-w-[85%] rounded-bl-sm bg-subtle px-4 py-2.5 text-ink"
        }`}
      >
        <span className="sr-only">{isUser ? "You said:" : "Nutraboom Equals said:"}</span>
        {message.urgentNotice && (
          <p
            role="alert"
            className="mb-2 rounded-lg border border-danger/50 bg-danger-soft px-2.5 py-2 text-sm font-semibold text-danger"
          >
            <span aria-hidden="true">⚠️ </span>
            {message.urgentNotice}
          </p>
        )}
        {hasOutcome && (
          <OutcomeCard
            outcome={message.outcome}
            mealPlan={message.mealPlan}
            budget={message.budget}
          />
        )}
        {/* Rendered as text, never HTML, so model output cannot inject markup. */}
        <p
          className={`whitespace-pre-wrap ${
            hasOutcome ? "mt-2 rounded-2xl rounded-tl-sm bg-subtle px-4 py-2.5" : ""
          }`}
        >
          {message.content}
        </p>
        {message.visuals && message.visuals.length > 0 && (
          <VisualGallery visuals={message.visuals} />
        )}
        {message.allergyNotice && (
          <p className="mt-2 rounded-lg bg-brand-soft px-2.5 py-1.5 text-sm text-ink">
            <span aria-hidden="true">🛡️ </span>
            <span className="sr-only">Allergy note: </span>
            {message.allergyNotice}
          </p>
        )}
        {message.safetyNotice && (
          <p className="mt-2 border-t border-line pt-2 text-sm text-muted">
            <span aria-hidden="true">ℹ️ </span>
            {message.safetyNotice}
          </p>
        )}
        {message.nutritionists && message.nutritionists.length > 0 && (
          <section aria-label="Nutritionists who could help" className="mt-3 flex flex-col gap-2">
            <p className="text-sm font-semibold text-ink">
              Verified nutritionists who could help. You arrange and pay for sessions with them
              directly.
            </p>
            <ul className="grid gap-2">
              {message.nutritionists.map((card) => (
                <li key={card.id}>
                  <NutritionistCardView card={card} compact newTab />
                </li>
              ))}
            </ul>
          </section>
        )}
        {message.products && message.products.length > 0 && (
          <div className="mt-3">
            <ProductRecommendations cards={message.products} newTab />
          </div>
        )}
        {message.sources && message.sources.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            Values are approximate. Data:{" "}
            {message.sources.map((s, i) => (
              <span key={s.url}>
                {i > 0 && "; "}
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-text underline underline-offset-2"
                >
                  {s.name}
                </a>
              </span>
            ))}
          </p>
        )}
        {!isUser && sign && message.content.trim() && (
          <SignLanguageResponseSlot
            text={message.content}
            module="assistant"
            latest={sign.latest}
          />
        )}
        {!isUser && listen && (
          <button
            type="button"
            onClick={() => listen.onListen(message)}
            aria-pressed={playing}
            aria-label={playing ? "Stop reading this reply" : "Listen to this reply"}
            className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 text-sm text-ink hover:bg-surface"
          >
            <span aria-hidden="true">{playing ? "⏹" : "🔊"}</span>
            {playing ? "Stop" : "Listen"}
          </button>
        )}
      </div>
    </div>
  );
}
