"use client";

import { useEffect, useRef, useState } from "react";
import { ChatInput } from "./ChatInput";
import { useChatPanel } from "./ChatProvider";
import { ErrorMessage } from "./ErrorMessage";
import { HistoryView } from "./HistoryView";
import { MessageList } from "./MessageList";
import { SettingsView } from "./SettingsView";
import { SuggestedPrompts } from "./SuggestedPrompts";
import { useChat, type UIMessage } from "./useChat";
import { useSettings } from "./useSettings";
import { useVoice } from "./useVoice";
import { isEnglish, type LanguageCode } from "@/lib/i18n/languages";
import { outcomeForSpeech, speechForReply } from "@/lib/voice/speech-text";

const MEAL_LABEL: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

/** What is read aloud for a reply: urgent notice, outcome summary, then the text. */
function spoken(m: UIMessage, language: LanguageCode): string {
  // The card is in English; it is summarised aloud only for English replies.
  const hasCard = m.outcome || m.mealPlan || m.budget;
  const outcome =
    hasCard && isEnglish(language)
      ? outcomeForSpeech({
          title: m.outcome?.title,
          subtitle: m.outcome?.subtitle,
          meals: m.mealPlan?.days.flatMap((day, d) =>
            day.meals.map((meal, i) => ({
              label: `${MEAL_LABEL[meal.mealType] ?? meal.mealType}${meal.packed ? ", for the lunchbox" : ""}`,
              name: meal.name,
              cost: m.outcome?.mealCosts?.[`${d}:${i}`],
              why: meal.why,
            })),
          ),
          total: m.budget?.estimatedTotal,
          remaining: m.budget?.estimatedRemaining,
        })
      : undefined;
  const reply = speechForReply({ ...m, message: m.content, outcome });
  // Pictures are described aloud, so listening alone loses nothing (ADR-085).
  const pictures = (m.visuals ?? []).map((v) => `Picture: ${v.title}. ${v.alt}`);
  return [reply, ...pictures].join(" ");
}

/** Line icons for the header buttons (24×24, stroke uses the text colour). */
const ICONS = {
  newChat: "M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3",
  expand: "M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7",
  shrink: "M4 14h6v6M20 10h-6V4M10 14l-7 7M14 10l7-7",
  minimize: "M5 19h14",
  history: "M3 12a9 9 0 1 0 2.6-6.4L3 8M3 3v5h5M12 7v5l3 2",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z",
  close: "M6 6l12 12M18 6 6 18",
  chat: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z",
} as const;

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

function IconButton({
  label,
  icon,
  onClick,
  className = "",
  ...rest
}: {
  label: string;
  icon: keyof typeof ICONS;
  onClick: () => void;
  className?: string;
  "aria-expanded"?: boolean;
  "aria-pressed"?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-subtle hover:text-ink ${className}`}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}

/** The round "E" avatar used in the header, the welcome and the minimized bar. */
function Avatar({ small = false }: { small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-brand font-bold text-white ${small ? "size-8 text-sm" : "size-10"}`}
    >
      E
    </span>
  );
}

/**
 * The assistant (ADR-072, redesigned in ADR-083). On wider screens it is a
 * non-modal side panel: the page behind stays usable, it can be expanded or
 * minimized to a small bar, and Escape closes it. On phones it fills the
 * screen and acts as a modal. The conversation survives closing and
 * minimizing until "New chat" clears it.
 */
export function ChatPanel() {
  const { mode, size, fullScreen, close, minimize, open, toggleSize } = useChatPanel();
  const isOpen = mode === "open";
  const { settings, update } = useSettings();
  const chat = useChat(undefined, undefined, settings.language, true);
  const voice = useVoice(undefined, settings.language);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const restoreRef = useRef<HTMLButtonElement>(null);
  /** Read the next reply aloud: set when the question was spoken (ADR-043). */
  const speakNextReply = useRef(false);
  /** Replies seen while open, so the minimized bar can say "New reply". */
  const [seen, setSeen] = useState(0);
  const { speak, stopSpeaking, stopListening } = voice;
  const replies = chat.messages.filter((m) => m.role === "assistant").length;
  if (isOpen && seen !== replies) setSeen(replies);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
    else if (mode === "minimized") restoreRef.current?.focus();
    else {
      stopListening();
      stopSpeaking();
    }
  }, [isOpen, mode, stopListening, stopSpeaking]);

  const lastMessage = chat.messages.at(-1);
  useEffect(() => {
    if (lastMessage?.role !== "assistant" || !speakNextReply.current) return;
    speakNextReply.current = false;
    speak(spoken(lastMessage, settings.language), lastMessage.id);
  }, [lastMessage, speak, settings.language]);

  function send(text: string, viaVoice: boolean) {
    speakNextReply.current = viaVoice;
    chat.sendMessage(text, { viaVoice });
  }

  function clearChat() {
    if (
      chat.messages.length > 0 &&
      !window.confirm("Start a new chat? This conversation will be cleared from this screen.")
    ) {
      return;
    }
    stopSpeaking();
    chat.clear();
    setShowSettings(false);
    setShowHistory(false);
    inputRef.current?.focus();
  }

  // Escape closes. Tab is kept inside only while the chat covers the screen.
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (!fullScreen || e.key !== "Tab" || !dialogRef.current) return;
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const expanded = size === "expanded";
  const unread = replies > seen;

  return (
    <>
      {mode === "minimized" && (
        <div
          role="region"
          aria-label="Minimized chat"
          className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex items-center gap-2 rounded-full border border-line bg-surface py-1.5 pr-1.5 pl-2 shadow-xl sm:right-6 sm:bottom-6 print:hidden"
        >
          <button
            ref={restoreRef}
            type="button"
            onClick={() => open()}
            aria-label={`Open the chat${unread ? ", new reply" : ""}`}
            className="flex items-center gap-2 rounded-full pr-2 text-left"
          >
            <Avatar small />
            <span className="flex flex-col">
              <span className="text-sm font-semibold text-ink">Nutraboom Equals</span>
              <span className="text-xs text-muted" aria-hidden="true">
                {chat.isLoading ? "Replying…" : unread ? "New reply" : "Chat minimized"}
              </span>
            </span>
            {unread && <span aria-hidden="true" className="size-2.5 rounded-full bg-gold" />}
          </button>
          <IconButton label="Close chat" icon="close" onClick={close} />
        </div>
      )}

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal={fullScreen ? "true" : "false"}
        aria-labelledby="chat-title"
        hidden={!isOpen}
        onKeyDown={handleKeyDown}
        className={`fixed inset-0 z-40 flex flex-col bg-surface sm:inset-auto sm:right-6 sm:rounded-3xl sm:border sm:border-line sm:shadow-2xl ${
          expanded
            ? "sm:top-6 sm:bottom-6 sm:w-[min(760px,calc(100vw-3rem))]"
            : "sm:bottom-6 sm:h-[min(680px,calc(100vh-3rem))] sm:w-[420px]"
        }`}
      >
        {/* A div, not <header>: inside the dialog a header would be a second page banner. */}
        <div className="flex items-center gap-2 border-b border-line px-3 py-3 sm:gap-3 sm:px-4">
          <Avatar />
          <div className="min-w-0 flex-1">
            <h2 id="chat-title" className="truncate font-semibold text-ink">
              Nutraboom Equals
            </h2>
            <p className="truncate text-xs text-muted">
              Nutrition help, not medical advice ·{" "}
              {/* A new tab, so opening it does not lose the conversation. */}
              <a
                href="/privacy"
                target="_blank"
                rel="noopener"
                className="underline underline-offset-2"
              >
                Privacy
              </a>
            </p>
          </div>
          <div className="flex items-center">
            {chat.messages.length > 0 && (
              <IconButton label="New chat" icon="newChat" onClick={clearChat} />
            )}
            <IconButton
              label={expanded ? "Make the chat smaller" : "Expand the chat"}
              icon={expanded ? "shrink" : "expand"}
              onClick={toggleSize}
              aria-pressed={expanded}
              className="max-sm:hidden"
            />
            <IconButton label="Minimize chat" icon="minimize" onClick={minimize} />
            <IconButton
              label="Saved chats"
              icon="history"
              onClick={() => {
                setShowSettings(false);
                setShowHistory((v) => !v);
              }}
              aria-expanded={showHistory}
            />
            <IconButton
              label="Settings"
              icon="settings"
              onClick={() => {
                setShowHistory(false);
                setShowSettings((v) => !v);
              }}
              aria-expanded={showSettings}
            />
            <IconButton label="Close chat" icon="close" onClick={close} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          <div className={expanded ? "mx-auto max-w-2xl" : undefined}>
            {showHistory ? (
              <HistoryView
                currentId={chat.conversationId}
                onOpen={(id, messages) => {
                  stopSpeaking();
                  chat.restore(id, messages);
                  setShowHistory(false);
                  inputRef.current?.focus();
                }}
                onDeleted={(id) => {
                  if (id === chat.conversationId) chat.clear();
                }}
                onDone={() => {
                  setShowHistory(false);
                  inputRef.current?.focus();
                }}
              />
            ) : showSettings ? (
              <SettingsView
                settings={settings}
                onChange={update}
                onDone={() => {
                  setShowSettings(false);
                  inputRef.current?.focus();
                }}
                canReadAloud={voice.outputSupported}
                canListen={voice.inputSupported}
              />
            ) : chat.messages.length === 0 ? (
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <Avatar />
                  <div className="rounded-2xl rounded-tl-sm bg-subtle px-4 py-3 text-ink">
                    <p className="font-semibold">Hello! I&apos;m Equals.</p>
                    <p className="mt-1">
                      Ask me about a food, a meal plan for your household, or what you can cook on
                      your budget. You can type, or speak with the microphone.
                    </p>
                  </div>
                </div>
                <SuggestedPrompts onSelect={(prompt) => send(prompt, false)} />
              </div>
            ) : (
              <MessageList
                messages={chat.messages}
                isLoading={chat.isLoading}
                signLanguage={settings.signLanguage}
                listen={
                  voice.outputSupported
                    ? {
                        speakingId: voice.speakingId,
                        onListen: (m) =>
                          voice.speakingId === m.id
                            ? stopSpeaking()
                            : speak(spoken(m, settings.language), m.id),
                      }
                    : undefined
                }
              />
            )}
            {chat.error && !showSettings && !showHistory && (
              <ErrorMessage message={chat.error} onRetry={chat.retry} />
            )}
            {chat.history?.saved === false &&
              chat.history.reason === "limit" &&
              !showSettings &&
              !showHistory && (
                <p
                  role="status"
                  className="mt-4 rounded-xl bg-brand-soft px-3 py-2 text-sm text-ink"
                >
                  This chat isn&apos;t being saved: you have {chat.history.max} saved chats, the
                  most your plan allows.{" "}
                  <button
                    type="button"
                    onClick={() => setShowHistory(true)}
                    className="font-medium text-brand-text underline"
                  >
                    Manage saved chats
                  </button>{" "}
                  or{" "}
                  <a href="/account/plan" className="font-medium text-brand-text underline">
                    upgrade
                  </a>
                  .
                </p>
              )}
          </div>
        </div>

        <div
          hidden={showSettings || showHistory}
          className={expanded ? "mx-auto w-full max-w-2xl" : undefined}
        >
          <ChatInput
            ref={inputRef}
            onSend={send}
            disabled={chat.isLoading}
            voice={voice}
            // Spoken commands are English words, so confirmation is offered in English only.
            confirmByVoice={settings.voiceConfirm && isEnglish(settings.language)}
          />
        </div>
      </div>
    </>
  );
}
