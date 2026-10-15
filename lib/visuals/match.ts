import { VISUALS, type Visual } from "./library";

/**
 * Picks reviewed pictures for a reply (ADR-085). Pictures are shown only when
 * the person asks to see something ("can I see it?", "show me a picture"),
 * and only from the reviewed library. The topic comes from their message, or
 * from the recent conversation when the message is just "show me".
 */

/** Words that ask to see something. */
export const VISUAL_REQUEST =
  /\b(show me|let me see|can i see|could i see|see (it|this|that|them|how|what|an? (image|picture|photo|example))|pictures?|photos?|images?|illustrations?|diagrams?|visual(ly|s)?|drawings?|what (does|do) (it|they|that|this|\w+( \w+)?) look like|how (does|do) (it|they|\w+) look)\b/i;

export function wantsVisual(message: string): boolean {
  return VISUAL_REQUEST.test(message);
}

const MAX_VISUALS = 2;

function matching(text: string) {
  return VISUALS.filter((v) => v.topic.test(text));
}

/** At most two pictures, best first; none unless the person asked to see something. */
export function findVisuals(message: string, recentText = ""): Visual[] {
  if (!wantsVisual(message)) return [];
  let found = matching(message);
  if (found.length === 0 && recentText) found = matching(recentText);
  return found
    .sort((a, b) => b.rank - a.rank)
    .slice(0, MAX_VISUALS)
    .map((v) => ({
      id: v.id,
      title: v.title,
      alt: v.alt,
      caption: v.caption,
      src: v.src,
      width: v.width,
      height: v.height,
      credit: v.credit,
    }));
}
