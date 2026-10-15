import {
  ENTITLEMENTS,
  freeDefaults,
  mergeEntitlements,
  parseEntitlements,
  type Entitlements,
  type NumberKey,
} from "./entitlements";
import {
  parseFeatureFlags,
  parseFreeEntitlements,
  parseGraceDays,
  parseRadiusKm,
  parseAudioSettings,
  type AudioSettings,
  SETTING_KEYS,
  type FeatureFlag,
  type FeatureFlags,
} from "./settings";

/**
 * The one place that answers "what may this subject do?" (ADR-062): the free
 * tier (defaults plus n-equals overrides) merged with every subscription that
 * currently counts. Pages and APIs ask this service; none of them knows plan
 * names or limits.
 */

export type Subject = { userId: string } | { organizationId: string };

export type SubscriptionStatus = "pending" | "active" | "past_due" | "canceled" | "expired";

export type SubscriptionGrant = {
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  graceUntil: Date | null;
  /** The plan's stored entitlements (untrusted JSON). */
  entitlements: unknown;
};

export interface BillingRepository {
  getSetting(key: string): Promise<unknown>;
  setSetting(key: string, value: unknown, actorUserId: string | null): Promise<void>;
  grantsFor(subject: Subject): Promise<SubscriptionGrant[]>;
  /** Current count, 0 when none. */
  usage(subjectKey: string, feature: string, periodStart: Date): Promise<number>;
  /**
   * Adds one use unless the count already reached `limit`, atomically.
   * Returns the new count, or null when the limit was reached.
   */
  incrementUsage(
    subjectKey: string,
    feature: string,
    periodStart: Date,
    limit: number,
  ): Promise<number | null>;
  /** Gives one use back (e.g. when the work it paid for failed). Never below zero. */
  decrementUsage(subjectKey: string, feature: string, periodStart: Date): Promise<void>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Nigeria has no daylight saving: West Africa Time is always UTC+1. */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

export function subjectKey(subject: Subject): string {
  return "userId" in subject ? `user:${subject.userId}` : `org:${subject.organizationId}`;
}

/** The first moment of the calendar month in Lagos, as a UTC instant. */
export function monthStart(now: Date): Date {
  const lagos = new Date(now.getTime() + LAGOS_OFFSET_MS);
  return new Date(Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), 1) - LAGOS_OFFSET_MS);
}

/**
 * Whether a subscription grants its plan now. An active one counts until its
 * period ends plus the grace days (a renewal webhook can arrive late); a
 * past-due one until its grace date. Pending, canceled and expired never do.
 */
export function grantCounts(grant: SubscriptionGrant, now: Date, graceDays: number): boolean {
  if (grant.status === "active") {
    if (!grant.currentPeriodEnd) return false;
    return grant.currentPeriodEnd.getTime() + graceDays * DAY_MS > now.getTime();
  }
  if (grant.status === "past_due") {
    return grant.graceUntil !== null && grant.graceUntil.getTime() > now.getTime();
  }
  return false;
}

export type UsageResult =
  { ok: true; used: number; limit: number } | { ok: false; used: number; limit: number };

/** Usage-limited features and the entitlement that sets each limit per month. */
export const USAGE_LIMITS = {
  mealPlans: "mealPlanner.plansPerMonth",
} as const satisfies Record<string, NumberKey>;
export type UsageFeature = keyof typeof USAGE_LIMITS;

export class EntitlementService {
  constructor(
    private readonly repo: BillingRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async freeTier(): Promise<Entitlements> {
    const overrides = parseFreeEntitlements(
      await this.repo.getSetting(SETTING_KEYS.freeEntitlements),
    );
    return { ...freeDefaults(), ...overrides };
  }

  async graceDays(): Promise<number> {
    return parseGraceDays(await this.repo.getSetting(SETTING_KEYS.graceDays));
  }

  async hospitalRadiusKm(): Promise<number> {
    return parseRadiusKm(await this.repo.getSetting(SETTING_KEYS.hospitalRadiusKm));
  }

  async audioSettings(): Promise<AudioSettings> {
    return parseAudioSettings(await this.repo.getSetting(SETTING_KEYS.audio));
  }

  async featureFlags(): Promise<FeatureFlags> {
    return parseFeatureFlags(await this.repo.getSetting(SETTING_KEYS.features));
  }

  async isEnabled(flag: FeatureFlag): Promise<boolean> {
    return (await this.featureFlags())[flag];
  }

  /** Entitlements for a signed-in user or an organisation; the free tier for anyone else. */
  async entitlementsFor(subject: Subject | null): Promise<Entitlements> {
    const free = await this.freeTier();
    if (!subject) return free;
    const [grants, graceDays] = await Promise.all([this.repo.grantsFor(subject), this.graceDays()]);
    const now = this.now();
    const counting = grants
      .filter((grant) => grantCounts(grant, now, graceDays))
      .map((grant) => parseEntitlements(grant.entitlements));
    return mergeEntitlements(free, ...counting);
  }

  async usage(subject: Subject, feature: UsageFeature): Promise<{ used: number; limit: number }> {
    const limit = (await this.entitlementsFor(subject))[USAGE_LIMITS[feature]];
    const used = await this.repo.usage(subjectKey(subject), feature, monthStart(this.now()));
    return { used, limit };
  }

  /** Gives back one use, when the work it paid for failed. */
  async refund(subject: Subject, feature: UsageFeature): Promise<void> {
    await this.repo.decrementUsage(subjectKey(subject), feature, monthStart(this.now()));
  }

  /** Records one use of a limited feature if the subject has any left this month. */
  async consume(subject: Subject, feature: UsageFeature): Promise<UsageResult> {
    const limit = (await this.entitlementsFor(subject))[USAGE_LIMITS[feature]];
    const key = subjectKey(subject);
    const period = monthStart(this.now());
    const count = await this.repo.incrementUsage(key, feature, period, limit);
    if (count === null)
      return { ok: false, used: await this.repo.usage(key, feature, period), limit };
    return { ok: true, used: count, limit };
  }
}

/** Human-readable value of an entitlement, for admin and account pages. */
export function describeEntitlement(key: keyof Entitlements, value: number | boolean): string {
  const spec = ENTITLEMENTS[key];
  if (spec.kind === "flag") return value ? "Included" : "Not included";
  return String(value);
}
