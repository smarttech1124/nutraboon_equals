"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { SignModule, SignResponse } from "@/lib/sign/types";

/**
 * A sign-language response under a reply (ADR-077), shared by every module
 * that shows replies. It asks /api/sign-language for a response and plays the
 * video it gets. Today that is a random demonstration video, unrelated to
 * the reply, always shown with the demo notice. The reply text above it is
 * never changed, whatever happens to the video.
 */

const FAILED_KEY = "nbe:sign-failed";
const PLAY_EVENT = "nbe:sign-play";
const LOAD_TIMEOUT_MS = 20_000;

/** Video ids that could not play in this browser during this visit. */
function failedIds(): string[] {
  try {
    const raw = window.sessionStorage.getItem(FAILED_KEY);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function rememberFailed(id: string) {
  try {
    const ids = new Set(failedIds());
    ids.add(id);
    window.sessionStorage.setItem(FAILED_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage blocked: this visit simply tries the video again later.
  }
}

type Phase = "fetching" | "loading" | "ready" | "exhausted" | "unavailable" | "error";

export function SignLanguageResponse({
  text,
  module,
  autoPlay = false,
}: {
  /** The reply this response belongs to (the demo provider ignores it). */
  text: string;
  module: SignModule;
  /** Start playing muted once loaded (skipped when reduced motion is preferred). */
  autoPlay?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("fetching");
  const [response, setResponse] = useState<SignResponse | null>(null);
  const [status, setStatus] = useState("Preparing a sign language video…");
  const videoRef = useRef<HTMLVideoElement>(null);
  const instance = useId();
  const noticeId = `${instance}-notice`;
  const titleId = `${instance}-title`;
  const pendingFailed = useRef<string[]>([]);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
  );

  const request = useCallback(
    // State changes only after the network answers; callers show "fetching" first.
    async (exclude: string[]) => {
      const failed = pendingFailed.current;
      pendingFailed.current = [];
      try {
        const res = await fetch("/api/sign-language", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: text.slice(0, 4000),
            module,
            exclude: [...new Set([...exclude, ...failedIds()])].slice(0, 30),
            failed,
          }),
        });
        const body = (await res.json().catch(() => null)) as {
          status?: string;
          response?: SignResponse;
        } | null;
        if (body?.status === "ok" && body.response) {
          setResponse(body.response);
          setPhase("loading");
          setStatus("Loading the sign language video…");
          return;
        }
        if (body?.status === "none") {
          setPhase("exhausted");
          setStatus("No sign language video can be played right now. The text reply is unchanged.");
          return;
        }
        if (body?.status === "unavailable") {
          setPhase("unavailable");
          setStatus("Sign language responses are not available at the moment.");
          return;
        }
        setPhase("error");
        setStatus("We couldn't get a sign language video. The text reply is unchanged.");
      } catch {
        setPhase("error");
        setStatus("We couldn't get a sign language video. The text reply is unchanged.");
      }
    },
    [text, module],
  );

  // First request when the component appears.
  useEffect(() => {
    void request([]);
  }, [request]);

  const clearTimer = () => {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
  };

  /** From a button or a failure: show progress, then ask for another video. */
  const requestAgain = useCallback(
    (exclude: string[]) => {
      setPhase("fetching");
      setStatus("Preparing a sign language video…");
      void request(exclude);
    },
    [request],
  );

  /** Videos already handled as failed, so one failure is reported once. */
  const handledFailures = useRef(new Set<string>());

  const onFailure = useCallback(() => {
    clearTimer();
    if (!response) return;
    const id = response.video.id;
    if (handledFailures.current.has(id)) return;
    handledFailures.current.add(id);
    rememberFailed(id);
    pendingFailed.current.push(id);
    requestAgain([id]);
  }, [response, requestAgain]);

  // A video that never loads counts as failed, so the reply never waits forever.
  useEffect(() => {
    if (phase !== "loading") return;
    timeout.current = setTimeout(onFailure, LOAD_TIMEOUT_MS);
    return clearTimer;
  }, [phase, onFailure]);

  // Only one sign video plays at a time across the page.
  useEffect(() => {
    const onOtherPlay = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== instance) videoRef.current?.pause();
    };
    window.addEventListener(PLAY_EVENT, onOtherPlay);
    return () => window.removeEventListener(PLAY_EVENT, onOtherPlay);
  }, [instance]);

  const video = response?.video;
  const shouldAutoPlay = autoPlay && !reducedMotion;

  return (
    <section
      aria-labelledby={titleId}
      className="mt-3 flex w-full max-w-sm flex-col gap-2 rounded-2xl border border-line bg-surface p-3"
    >
      <p id={titleId} className="text-sm font-semibold text-ink">
        Sign language response
        {video && <span className="font-normal text-muted"> · {video.language}</span>}
      </p>
      {response?.notice && (
        <p
          id={noticeId}
          className="rounded-lg border border-gold bg-gold-soft px-2.5 py-1.5 text-sm font-medium text-gold-text"
        >
          {response.notice}
        </p>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>

      {(phase === "fetching" || phase === "loading") && (
        <div
          aria-hidden="true"
          className="flex h-40 items-center justify-center rounded-xl bg-subtle text-sm text-muted motion-safe:animate-pulse"
        >
          Preparing video…
        </div>
      )}

      {video && (phase === "loading" || phase === "ready") && (
        <video
          key={video.id}
          ref={videoRef}
          controls
          muted
          playsInline
          preload="metadata"
          autoPlay={shouldAutoPlay}
          aria-label={`Sign language demonstration video: ${video.title}, in ${video.language}`}
          aria-describedby={response?.notice ? noticeId : undefined}
          onLoadedMetadata={() => {
            clearTimer();
            setPhase("ready");
            setStatus(`Sign language demo video ready: ${video.title}, in ${video.language}.`);
          }}
          onError={onFailure}
          onPlay={() => window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: instance }))}
          className={`w-full rounded-xl bg-black ${
            video.orientation === "portrait"
              ? "mx-auto aspect-[9/16] max-h-80 w-auto"
              : "aspect-video"
          } ${phase === "loading" ? "sr-only" : ""}`}
        >
          {video.sources.map((s, i) => (
            <source
              key={s.src}
              src={s.src}
              type={s.type}
              // When the last source fails, the browser has nothing left to try.
              onError={i === video.sources.length - 1 ? onFailure : undefined}
            />
          ))}
        </video>
      )}

      {(phase === "exhausted" || phase === "unavailable" || phase === "error") && (
        // Announced by the status region above; shown here for sighted readers.
        <p aria-hidden="true" className="rounded-xl bg-subtle px-3 py-2 text-sm text-ink">
          {status}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {phase === "ready" && (
          <button
            type="button"
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              v.currentTime = 0;
              void v.play().catch(() => {});
            }}
            className="inline-flex min-h-9 items-center rounded-full border border-line px-3 text-sm font-medium text-ink hover:bg-subtle"
          >
            Replay
          </button>
        )}
        {(phase === "ready" || phase === "error" || phase === "exhausted") &&
          response?.kind !== "translation" && (
            <button
              type="button"
              onClick={() => requestAgain(video ? [video.id] : [])}
              className="inline-flex min-h-9 items-center rounded-full border border-line px-3 text-sm font-medium text-ink hover:bg-subtle"
            >
              {phase === "ready" ? "Show another demo video" : "Try again"}
            </button>
          )}
      </div>

      {video && phase === "ready" && (
        <p className="text-xs text-muted">
          {video.title}. Video by {video.attribution.author},{" "}
          <a
            href={video.attribution.licenseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {video.attribution.license}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          , via{" "}
          <a
            href={video.attribution.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {video.attribution.sourceName}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          .
        </p>
      )}
    </section>
  );
}

/**
 * For older replies: a button that loads the sign-language response on
 * request, so a long conversation does not load a video per message.
 */
export function SignLanguageResponseSlot({
  text,
  module,
  latest,
}: {
  text: string;
  module: SignModule;
  /** The newest reply loads (and plays) by itself. */
  latest: boolean;
}) {
  const [open, setOpen] = useState(latest);
  if (open) return <SignLanguageResponse text={text} module={module} autoPlay />;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="mt-2 inline-flex min-h-9 items-center rounded-full border border-line px-3 text-sm font-medium text-ink hover:bg-surface"
    >
      Show sign language video (demo)
    </button>
  );
}
