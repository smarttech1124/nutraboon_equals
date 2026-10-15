import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import type { BillingRepository, Subject, SubscriptionGrant } from "./service";

export class PrismaBillingRepository implements BillingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getSetting(key: string): Promise<unknown> {
    const row = await this.prisma.platformSetting.findUnique({ where: { key } });
    return row?.value ?? undefined;
  }

  async setSetting(key: string, value: unknown, actorUserId: string | null): Promise<void> {
    const json = value as Prisma.InputJsonValue;
    await this.prisma.platformSetting.upsert({
      where: { key },
      create: { key, value: json, updatedById: actorUserId },
      update: { value: json, updatedById: actorUserId },
    });
  }

  async grantsFor(subject: Subject): Promise<SubscriptionGrant[]> {
    const rows = await this.prisma.subscription.findMany({
      where: {
        ...("userId" in subject
          ? { userId: subject.userId }
          : { organizationId: subject.organizationId }),
        status: { in: ["active", "past_due"] },
      },
      select: {
        status: true,
        currentPeriodEnd: true,
        graceUntil: true,
        plan: { select: { entitlements: true } },
      },
    });
    return rows.map((row) => ({
      status: row.status,
      currentPeriodEnd: row.currentPeriodEnd,
      graceUntil: row.graceUntil,
      entitlements: row.plan.entitlements,
    }));
  }

  async usage(subjectKey: string, feature: string, periodStart: Date): Promise<number> {
    const row = await this.prisma.usageCounter.findUnique({
      where: { subjectKey_feature_periodStart: { subjectKey, feature, periodStart } },
    });
    return row?.count ?? 0;
  }

  async incrementUsage(
    subjectKey: string,
    feature: string,
    periodStart: Date,
    limit: number,
  ): Promise<number | null> {
    if (limit <= 0) return null;
    // One statement, so two requests at once cannot both take the last use.
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "UsageCounter" ("subjectKey", "feature", "periodStart", "count")
      VALUES (${subjectKey}, ${feature}, ${periodStart}, 1)
      ON CONFLICT ("subjectKey", "feature", "periodStart")
      DO UPDATE SET "count" = "UsageCounter"."count" + 1
      WHERE "UsageCounter"."count" < ${limit}
      RETURNING "count"`;
    return rows[0]?.count ?? null;
  }

  async decrementUsage(subjectKey: string, feature: string, periodStart: Date): Promise<void> {
    await this.prisma.usageCounter.updateMany({
      where: { subjectKey, feature, periodStart, count: { gt: 0 } },
      data: { count: { decrement: 1 } },
    });
  }
}

/** For tests. */
export class InMemoryBillingRepository implements BillingRepository {
  settings = new Map<string, unknown>();
  grants = new Map<string, SubscriptionGrant[]>();
  counters = new Map<string, number>();

  async getSetting(key: string): Promise<unknown> {
    return this.settings.get(key);
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    this.settings.set(key, value);
  }

  async grantsFor(subject: Subject): Promise<SubscriptionGrant[]> {
    const key = "userId" in subject ? `user:${subject.userId}` : `org:${subject.organizationId}`;
    return this.grants.get(key) ?? [];
  }

  async usage(subjectKey: string, feature: string, periodStart: Date): Promise<number> {
    return this.counters.get(`${subjectKey}|${feature}|${periodStart.toISOString()}`) ?? 0;
  }

  async incrementUsage(
    subjectKey: string,
    feature: string,
    periodStart: Date,
    limit: number,
  ): Promise<number | null> {
    const key = `${subjectKey}|${feature}|${periodStart.toISOString()}`;
    const count = this.counters.get(key) ?? 0;
    if (count >= limit) return null;
    this.counters.set(key, count + 1);
    return count + 1;
  }

  async decrementUsage(subjectKey: string, feature: string, periodStart: Date): Promise<void> {
    const key = `${subjectKey}|${feature}|${periodStart.toISOString()}`;
    this.counters.set(key, Math.max(0, (this.counters.get(key) ?? 0) - 1));
  }
}
