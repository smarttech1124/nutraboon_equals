/**
 * Timeline of a demo recording: chapter titles and captions with their times
 * in the video, and the files made from it (SubRip captions, ffmpeg chapter
 * metadata, a narration script). Pure functions, so they are unit-tested.
 */

export type TimelineEvent = {
  kind: "chapter" | "caption";
  /** Seconds from the start of the video. */
  start: number;
  end: number;
  text: string;
};

export class Timeline {
  readonly events: TimelineEvent[] = [];
  private openCaption: TimelineEvent | undefined;

  /** `startedAt` is when the page (and so the video) began, in ms since the epoch. */
  constructor(
    private readonly startedAt: number,
    private readonly now: () => number = Date.now,
  ) {}

  private seconds(): number {
    return Math.max(0, (this.now() - this.startedAt) / 1000);
  }

  chapter(title: string): void {
    const t = this.seconds();
    const last = this.events.findLast((e) => e.kind === "chapter");
    if (last && last.end === Infinity) last.end = t;
    this.events.push({ kind: "chapter", start: t, end: Infinity, text: title });
  }

  caption(text: string): void {
    this.endCaption();
    this.openCaption = { kind: "caption", start: this.seconds(), end: Infinity, text };
    this.events.push(this.openCaption);
  }

  endCaption(): void {
    if (this.openCaption) this.openCaption.end = this.seconds();
    this.openCaption = undefined;
  }

  /** Closes whatever is still open at the end of the recording. */
  finish(): TimelineEvent[] {
    const t = this.seconds();
    this.endCaption();
    for (const e of this.events) if (e.end === Infinity) e.end = t;
    return this.events;
  }
}

/** Moves every event `offset` seconds earlier (for a video trimmed at the start). */
export function shiftEvents(events: TimelineEvent[], offset: number): TimelineEvent[] {
  return events.map((e) => ({
    ...e,
    start: Math.max(0, e.start - offset),
    end: Math.max(0, e.end - offset),
  }));
}

function srtTime(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(
    Math.floor(ms / 1000) % 60,
  )},${pad(ms % 1000, 3)}`;
}

/** SubRip captions: each caption, with chapter titles shown for their first seconds. */
export function toSrt(events: TimelineEvent[]): string {
  const cues = events
    .map((e) =>
      e.kind === "chapter"
        ? { start: e.start, end: Math.min(e.end, e.start + 2.5), text: e.text.toUpperCase() }
        : { start: e.start, end: e.end, text: e.text },
    )
    .filter((c) => c.end - c.start >= 0.3)
    .sort((a, b) => a.start - b.start);
  return cues
    .map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`)
    .join("\n");
}

/** ffmpeg FFMETADATA1 chapters, so players show a chapter menu in the MP4. */
export function toFfmetadata(events: TimelineEvent[], title: string): string {
  const escape = (s: string) => s.replace(/([=;#\\\n])/g, "\\$1");
  const chapters = events
    .filter((e) => e.kind === "chapter")
    .map(
      (e) =>
        `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(e.start * 1000)}\nEND=${Math.round(
          e.end * 1000,
        )}\ntitle=${escape(e.text)}\n`,
    );
  return `;FFMETADATA1\ntitle=${escape(title)}\n\n${chapters.join("\n")}`;
}

/** A plain-text voice-over script with timings, for recording or text-to-speech. */
export function toNarrationScript(events: TimelineEvent[]): string {
  const clock = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return events
    .map((e) =>
      e.kind === "chapter"
        ? `\n[${clock(e.start)}] ## ${e.text}`
        : `[${clock(e.start)}–${clock(e.end)}] ${e.text}`,
    )
    .join("\n")
    .trim()
    .concat("\n");
}

/** YouTube-style chapter list (the first chapter must start at 0:00). */
export function toChapterList(events: TimelineEvent[]): string {
  const clock = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return events
    .filter((e) => e.kind === "chapter")
    .map((e, i) => `${i === 0 ? "0:00" : clock(e.start)} ${e.text}`)
    .join("\n")
    .concat("\n");
}
