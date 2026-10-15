import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import type { BillingStore, CustomerQuery, StoredSubscription } from "./processor";
import type { ProviderKind } from "./types";

const SELECT = {
  id: true,
  status: true,
  providerSubscriptionRef: true,
  currentPeriodEnd: true,
  plan: { select: { interval: true, priceMinor: true, currency: true } },
} as const;

/** PostgreSQL storage for the billing processor (ADR-063). */
export class PrismaBillingStore implements BillingStore {
  constructor(private readonly prisma: PrismaClient) {}

  async byCheckoutReference(
    provider: ProviderKind,
    reference: string,
  ): Promise<StoredSubscription | null> {
    return this.prisma.subscription.findFirst({
      where: { provider, checkoutReference: reference },
      select: SELECT,
    });
  }

  async findForCustomer(
    provider: ProviderKind,
    query: CustomerQuery,
  ): Promise<StoredSubscription | null> {
    const planField = provider === "paystack" ? "paystackPlanCode" : "flutterwavePlanId";
    return this.prisma.subscription.findFirst({
      where: {
        provider,
        status: { in: query.statuses },
        // A business's subscription is matched through its owner's email (ADR-067).
        AND: [
          {
            OR: [
              { user: { email: query.email.trim().toLowerCase() } },
              {
                organization: {
                  memberships: {
                    some: { role: "owner", user: { email: query.email.trim().toLowerCase() } },
                  },
                },
              },
            ],
          },
        ],
        ...(query.subscriptionRef
          ? {
              OR: [
                { providerSubscriptionRef: query.subscriptionRef },
                { providerSubscriptionRef: null },
              ],
            }
          : {}),
        ...(query.providerPlanId ? { plan: { [planField]: query.providerPlanId } } : {}),
      },
      orderBy: [{ providerSubscriptionRef: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      select: SELECT,
    });
  }

  async activatePending(id: string, start: Date, end: Date): Promise<boolean> {
    const { count } = await this.prisma.subscription.updateMany({
      where: { id, status: "pending" },
      data: {
        status: "active",
        currentPeriodStart: start,
        currentPeriodEnd: end,
        graceUntil: null,
      },
    });
    return count === 1;
  }

  async extend(id: string, start: Date, end: Date): Promise<void> {
    await this.prisma.subscription.update({
      where: { id },
      data: {
        status: "active",
        currentPeriodStart: start,
        currentPeriodEnd: end,
        graceUntil: null,
      },
    });
  }

  async update(id: string, data: Parameters<BillingStore["update"]>[1]): Promise<void> {
    await this.prisma.subscription.update({ where: { id }, data });
  }

  async recordEvent(provider: ProviderKind, eventId: string, type: string): Promise<boolean> {
    try {
      await this.prisma.paymentEvent.create({ data: { provider, eventId, type } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return false;
      }
      throw error;
    }
  }

  async forgetEvent(provider: ProviderKind, eventId: string): Promise<void> {
    await this.prisma.paymentEvent.deleteMany({ where: { provider, eventId } });
  }
}
