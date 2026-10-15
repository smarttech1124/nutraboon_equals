import { zoneOfState } from "@/lib/budget/regions";
import { parseAvailability } from "./availability";
import type { Specialization } from "./specializations";

/**
 * Deterministic matching (ADR-064): no AI decides who is shown. Candidates
 * are already verified and entitled to a listing; this only orders them.
 */

export type Candidate = {
  userId: string;
  specializations: string[];
  state: string | null;
  sessionTypes: string[];
  sessionFeeMinor: number;
  availability: unknown;
  verifiedAt: Date | null;
};

export type MatchQuery = {
  /** The user's state, when known. */
  state?: string | null;
  specializations?: Specialization[];
  sessionType?: "online" | "in_person";
  /** Highest fee the user wants to see, in kobo. */
  maxFeeMinor?: number;
};

/** Higher is better; null means the candidate does not fit at all. */
export function matchScore(c: Candidate, q: MatchQuery): number | null {
  if (parseAvailability(c.availability).length === 0) return null;
  if (q.sessionType && !c.sessionTypes.includes(q.sessionType)) return null;
  if (q.maxFeeMinor !== undefined && c.sessionFeeMinor > q.maxFeeMinor) return null;

  const sameState = Boolean(q.state && c.state === q.state);
  const sameZone = Boolean(
    q.state && c.state && !sameState && zoneOfState(q.state) === zoneOfState(c.state),
  );
  const offersOnline = c.sessionTypes.includes("online");
  // In person only makes sense nearby; someone far away must offer online sessions.
  if (q.state && !sameState && !offersOnline && q.sessionType !== "in_person") return null;
  if (q.sessionType === "in_person" && q.state && !sameState && !sameZone) return null;

  const wanted = q.specializations ?? [];
  const matched = wanted.filter((s) => c.specializations.includes(s)).length;
  if (wanted.length > 0 && matched === 0 && !c.specializations.includes("general")) return null;

  return matched * 4 + (sameState ? 3 : sameZone ? 1 : 0) + (offersOnline ? 1 : 0);
}

export function rankCandidates<T extends Candidate>(candidates: T[], query: MatchQuery): T[] {
  return candidates
    .flatMap((c) => {
      const score = matchScore(c, query);
      return score === null ? [] : [{ c, score }];
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.c.sessionFeeMinor - b.c.sessionFeeMinor ||
        (a.c.verifiedAt?.getTime() ?? 0) - (b.c.verifiedAt?.getTime() ?? 0),
    )
    .map(({ c }) => c);
}
