import { beforeEach, describe, expect, it, vi } from "vitest";

const db = {
  membership: { findMany: vi.fn(), updateMany: vi.fn() },
  organization: { findUniqueOrThrow: vi.fn() },
  user: { findUnique: vi.fn() },
};
const notify = vi.fn<(userId: string, message: unknown) => Promise<void>>(async () => {});
const send = vi.fn<(email: Record<string, unknown>) => Promise<void>>(async () => {});
vi.mock("@/lib/db", () => ({ getPrisma: () => db }));
vi.mock("@/lib/notifications", () => ({ notify }));
vi.mock("@/lib/email", async (original) => ({
  ...(await original<typeof import("@/lib/email")>()),
  getEmailSender: () => ({ available: true, send }),
}));

const { activateHospitalStaff, isActiveMember } = await import("@/lib/hospitals/staff");
const { staffInviteMessage } = await import("@/lib/email/templates");
const { NO_PASSWORD } = await import("@/lib/auth/service");

describe("hospital staff activation (ADR-089)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.organization.findUniqueOrThrow.mockResolvedValue({ name: "Bodija Community Hospital" });
  });

  it("treats the owner as always active and other staff as pending until activated", () => {
    expect(isActiveMember({ role: "owner", activatedAt: null })).toBe(true);
    expect(isActiveMember({ role: "doctor", activatedAt: null })).toBe(false);
    expect(isActiveMember({ role: "admin", activatedAt: null })).toBe(false);
    expect(isActiveMember({ role: "nurse", activatedAt: new Date() })).toBe(true);
  });

  it("activates pending staff on verification, notifying all and inviting new accounts by email", async () => {
    db.membership.findMany.mockResolvedValue([
      // Made by the hospital: no password, never signed in.
      { userId: "new", user: { passwordHash: NO_PASSWORD, sessions: [] } },
      // An existing account the hospital linked.
      { userId: "old", user: { passwordHash: "scrypt$x", sessions: [{ id: "s" }] } },
    ]);
    db.user.findUnique.mockResolvedValue({ email: "nurse@bodija.example.test" });

    expect(await activateHospitalStaff("org1")).toBe(2);
    expect(db.membership.updateMany).toHaveBeenCalledWith({
      where: { organizationId: "org1", activatedAt: null },
      data: { activatedAt: expect.any(Date) },
    });
    expect(notify.mock.calls.map((c) => c[0])).toEqual(["new", "old"]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toMatchObject({
      to: "nurse@bodija.example.test",
      template: "staff_invite",
      idempotencyKey: "staff-invite/new",
    });
  });

  it("does nothing when nobody is pending", async () => {
    db.membership.findMany.mockResolvedValue([]);
    expect(await activateHospitalStaff("org1")).toBe(0);
    expect(db.membership.updateMany).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("writes an invitation that explains how to set a password, without one in it", () => {
    const email = staffInviteMessage(
      { hospitalName: "Bodija <Clinic>", email: "nurse@bodija.example.test" },
      "https://nutraboom-equals.vercel.app",
    );
    expect(email.subject).toBe("You've been added to Bodija <Clinic> on Nutraboom Equals");
    expect(email.html).toContain("Bodija &lt;Clinic&gt;");
    expect(email.html).toContain('href="https://nutraboom-equals.vercel.app/forgot-password"');
    expect(email.text).toContain(
      "Choose my password: https://nutraboom-equals.vercel.app/forgot-password",
    );
    expect(email.text).toContain("nurse@bodija.example.test");
  });
});
