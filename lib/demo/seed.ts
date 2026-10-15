import { hashPassword } from "@/lib/admin/password";
import { NO_PASSWORD } from "@/lib/auth/service";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { productAllergens } from "@/lib/vendors/product";
import { DEMO_HOSPITALS, DEMO_NUTRITIONISTS, DEMO_PLANS, DEMO_VENDORS, demoEmail } from "./data";

/**
 * Seeds the demonstration data (ADR-074). Idempotent: every record has a
 * fixed id or unique key and is upserted, so re-running updates the demo
 * records in place and never duplicates them. It only ever writes records it
 * owns (demo ids, demo-*@example.test accounts); existing plans with the same
 * code are left untouched. Nothing is deleted.
 */

export type DemoSeedResult = {
  plans: number;
  plansKept: number;
  nutritionists: number;
  vendors: number;
  products: number;
  hospitals: number;
  departments: number;
  /** The demo member and the demo administrator (ADR-080), for walkthroughs and demo videos. */
  accounts: number;
};

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

async function upsertUser(
  prisma: PrismaClient,
  key: string,
  name: string,
  passwordHash: string,
  now: Date,
): Promise<string> {
  const email = demoEmail(key);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name, passwordHash, emailVerifiedAt: now },
    update: { name, passwordHash, status: "active" },
    select: { id: true },
  });
  return user.id;
}

/** A manual, non-renewing grant that keeps a demo partner listed for a year from each seed. */
async function grant(
  prisma: PrismaClient,
  id: string,
  planId: string,
  holder: { userId: string } | { organizationId: string },
  now: Date,
) {
  const data = {
    planId,
    status: "active" as const,
    provider: "manual" as const,
    currentPeriodStart: now,
    currentPeriodEnd: new Date(now.getTime() + YEAR_MS),
    cancelAtPeriodEnd: true,
  };
  await prisma.subscription.upsert({
    where: { id },
    create: { id, ...holder, ...data },
    update: data,
  });
}

export async function seedDemo(
  prisma: PrismaClient,
  options: { password?: string; now?: Date } = {},
): Promise<DemoSeedResult> {
  const now = options.now ?? new Date();
  // Demo accounts cannot sign in unless a password is given for this run.
  const passwordHash = options.password ? await hashPassword(options.password) : NO_PASSWORD;
  const result: DemoSeedResult = {
    plans: 0,
    plansKept: 0,
    nutritionists: 0,
    vendors: 0,
    products: 0,
    hospitals: 0,
    departments: 0,
    accounts: 0,
  };

  const planIds = new Map<string, string>();
  for (const p of DEMO_PLANS) {
    const existing = await prisma.plan.findUnique({ where: { code: p.code } });
    if (existing) {
      // A plan an administrator already made is never overwritten.
      planIds.set(p.code, existing.id);
      result.plansKept++;
      continue;
    }
    const created = await prisma.plan.create({
      data: {
        code: p.code,
        name: p.name,
        description: p.description,
        audience: p.audience,
        interval: p.interval,
        priceMinor: p.priceMinor,
        entitlements: p.entitlements,
      },
    });
    planIds.set(p.code, created.id);
    result.plans++;
  }

  for (const n of DEMO_NUTRITIONISTS) {
    const userId = await upsertUser(prisma, `nutritionist-${n.key}`, n.name, passwordHash, now);
    const profile = {
      status: "verified" as const,
      title: n.title,
      bio: n.bio,
      specializations: n.specializations,
      expertise: n.expertise,
      yearsExperience: n.yearsExperience,
      state: n.state,
      city: n.city,
      sessionTypes: n.sessionTypes,
      sessionFeeMinor: n.sessionFeeMinor,
      sessionMinutes: n.sessionMinutes,
      contactEmail: demoEmail(`nutritionist-${n.key}`),
      availability: n.availability,
      submittedAt: now,
      verifiedAt: now,
      reviewNote: null,
    };
    await prisma.nutritionistProfile.upsert({
      where: { userId },
      create: { userId, ...profile },
      update: profile,
    });
    await prisma.$transaction([
      prisma.qualification.deleteMany({ where: { profileId: userId } }),
      prisma.qualification.createMany({
        data: n.qualifications.map((q) => ({
          profileId: userId,
          kind: q.kind,
          title: q.title,
          institution: q.institution,
          year: q.year,
          registrationNumber: q.registrationNumber ?? null,
        })),
      }),
    ]);
    await grant(
      prisma,
      `demo-sub-nutritionist-${n.key}`,
      planIds.get("nutritionist-listed")!,
      { userId },
      now,
    );
    result.nutritionists++;
  }

  for (const v of DEMO_VENDORS) {
    const orgId = `demo-vendor-${v.key}`;
    const ownerId = await upsertUser(prisma, `vendor-${v.key}`, v.owner, passwordHash, now);
    await prisma.organization.upsert({
      where: { id: orgId },
      create: { id: orgId, kind: "vendor", name: v.name, status: "verified" },
      update: { name: v.name, status: "verified" },
    });
    await prisma.membership.upsert({
      where: { userId_organizationId: { userId: ownerId, organizationId: orgId } },
      create: { userId: ownerId, organizationId: orgId, role: "owner" },
      update: { role: "owner" },
    });
    const profile = {
      status: "verified" as const,
      description: v.description,
      categories: v.categories,
      website: `https://example.com/${v.key}`,
      contactEmail: demoEmail(`vendor-${v.key}`),
      state: v.state,
      city: v.city,
      registrationNumber: v.registrationNumber,
      submittedAt: now,
      verifiedAt: now,
      reviewNote: null,
    };
    await prisma.vendorProfile.upsert({
      where: { organizationId: orgId },
      create: { organizationId: orgId, ...profile },
      update: profile,
    });
    for (const p of v.products) {
      const id = `demo-product-${p.key}`;
      const data = {
        status: "verified" as const,
        name: p.name,
        category: p.category,
        description: p.description,
        benefits: p.benefits,
        recommendedUse: p.recommendedUse,
        ingredients: p.ingredients,
        allergens: productAllergens(p.allergens, p.name, p.ingredients),
        matchTerms: p.matchTerms,
        availability: p.availability,
        purchaseLocations: p.where,
        priceNaira: p.priceNaira,
        submittedAt: now,
        verifiedAt: now,
        reviewNote: null,
      };
      await prisma.product.upsert({
        where: { id },
        create: { id, organizationId: orgId, ...data },
        update: data,
      });
      result.products++;
    }
    await grant(
      prisma,
      `demo-sub-vendor-${v.key}`,
      planIds.get("vendor-growth")!,
      { organizationId: orgId },
      now,
    );
    result.vendors++;
  }

  for (const h of DEMO_HOSPITALS) {
    const orgId = `demo-hospital-${h.key}`;
    const ownerId = await upsertUser(prisma, `hospital-${h.key}`, h.owner, passwordHash, now);
    await prisma.organization.upsert({
      where: { id: orgId },
      create: { id: orgId, kind: "hospital", name: h.name, status: "verified" },
      update: { name: h.name, status: "verified" },
    });
    await prisma.membership.upsert({
      where: { userId_organizationId: { userId: ownerId, organizationId: orgId } },
      create: { userId: ownerId, organizationId: orgId, role: "owner" },
      update: { role: "owner" },
    });
    const profile = {
      status: "verified" as const,
      description: h.description,
      address: h.address,
      area: h.area,
      city: h.city,
      state: h.state,
      latitude: h.latitude,
      longitude: h.longitude,
      phone: null,
      email: demoEmail(`hospital-${h.key}`),
      website: `https://example.com/${h.key}-hospital`,
      registrationNumber: h.registrationNumber,
      accessibility: h.accessibility,
      submittedAt: now,
      verifiedAt: now,
      reviewNote: null,
    };
    await prisma.hospitalProfile.upsert({
      where: { organizationId: orgId },
      create: { organizationId: orgId, ...profile },
      update: profile,
    });
    for (const d of h.departments) {
      const id = `demo-dept-${d.key}`;
      const data = {
        name: d.name,
        description: d.description,
        active: true,
        slotMinutes: d.slotMinutes,
        capacity: d.capacity,
        availability: d.availability,
      };
      await prisma.hospitalDepartment.upsert({
        where: { id },
        create: { id, organizationId: orgId, ...data },
        update: data,
      });
      result.departments++;
    }
    await grant(
      prisma,
      `demo-sub-hospital-${h.key}`,
      planIds.get("hospital-partner")!,
      { organizationId: orgId },
      now,
    );
    result.hospitals++;
  }

  // A member to sign in as on the main site, and a super administrator for
  // n-equals (demo-user@ and demo-admin@example.test). Neither can sign in
  // without DEMO_PASSWORD.
  await upsertUser(prisma, "user", "Amaka Okafor (demo)", passwordHash, now);
  const adminId = await upsertUser(prisma, "admin", "Tunde Bello (demo admin)", passwordHash, now);
  await prisma.adminRoleAssignment.upsert({
    where: { userId_role: { userId: adminId, role: "super_admin" } },
    create: { userId: adminId, role: "super_admin" },
    update: {},
  });
  result.accounts = 2;

  return result;
}
