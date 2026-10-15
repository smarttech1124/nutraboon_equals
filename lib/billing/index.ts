import { getPrisma } from "@/lib/db";
import { PrismaBillingRepository } from "./repository";
import { EntitlementService } from "./service";

const shared = globalThis as unknown as { entitlementService?: EntitlementService };

/** The shared entitlement service (ADR-062), created on first use. */
export function getEntitlementService(): EntitlementService {
  shared.entitlementService ??= new EntitlementService(new PrismaBillingRepository(getPrisma()));
  return shared.entitlementService;
}
