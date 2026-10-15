import { beforeEach, describe, expect, it } from "vitest";
import { can, permissionsOf } from "@/lib/auth/permissions";
import { InMemoryAuthRepository } from "@/lib/auth/repository";
import { AuthService, hashToken, SESSION_TTL_MS } from "@/lib/auth/service";

let repo: InMemoryAuthRepository;
let service: AuthService;
let clock: number;
const PASSWORD = "correct horse battery";

beforeEach(() => {
  repo = new InMemoryAuthRepository();
  clock = Date.UTC(2026, 9, 8, 9);
  service = new AuthService(repo, () => new Date(clock));
});

async function account(email = "ada@example.com") {
  const result = await service.signUp({ email, name: "Ada", password: PASSWORD });
  if (!result.ok) throw new Error(result.error);
  return result.user;
}

describe("sign-up", () => {
  it("creates an account with a hashed password and a normalised email", async () => {
    const user = await account("  Ada@Example.COM ");
    expect(user).toEqual({
      id: user.id,
      email: "ada@example.com",
      name: "Ada",
      emailVerified: false,
      adminRoles: [],
    });
    const stored = repo.users.get(user.id)!;
    expect(stored.passwordHash).toMatch(/^scrypt:/);
    expect(stored.passwordHash).not.toContain(PASSWORD);
  });

  it("rejects weak input and an email already in use, without confirming the account", async () => {
    expect(await service.signUp({ email: "x", name: "A", password: PASSWORD })).toMatchObject({
      ok: false,
    });
    expect(await service.signUp({ email: "a@b.co", name: "A", password: "short" })).toMatchObject({
      ok: false,
      error: "Use at least 10 characters.",
    });
    await account();
    expect(
      await service.signUp({ email: "ada@example.com", name: "B", password: PASSWORD }),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/can't be used/),
    });
  });
});

describe("sign-in and sessions", () => {
  it("signs in, stores only the token's hash, and resolves the session", async () => {
    await account();
    const result = await service.signIn({
      email: "ADA@example.com",
      password: PASSWORD,
      app: "web",
    });
    if (!result.ok) throw new Error(result.error);
    expect(repo.sessions.has(result.token)).toBe(false);
    expect(repo.sessions.has(hashToken(result.token))).toBe(true);
    expect((await service.getSession(result.token, "web"))?.user.email).toBe("ada@example.com");
    // A web session is not an admin session.
    expect(await service.getSession(result.token, "admin")).toBeNull();
  });

  it("gives the same answer for an unknown email and a wrong password", async () => {
    await account();
    const unknown = await service.signIn({
      email: "nobody@example.com",
      password: PASSWORD,
      app: "web",
    });
    const wrong = await service.signIn({
      email: "ada@example.com",
      password: "wrong password!",
      app: "web",
    });
    expect(unknown).toEqual({ ok: false, error: "Incorrect email or password." });
    expect(wrong).toEqual(unknown);
  });

  it("refuses suspended accounts and ends their sessions", async () => {
    const user = await account();
    const result = await service.signIn({
      email: "ada@example.com",
      password: PASSWORD,
      app: "web",
    });
    repo.users.set(user.id, { ...repo.users.get(user.id)!, status: "suspended" });
    expect(await service.getSession(result.ok ? result.token : "", "web")).toBeNull();
    expect(
      await service.signIn({ email: "ada@example.com", password: PASSWORD, app: "web" }),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/suspended/),
    });
  });

  it("lets only administrators into the admin app", async () => {
    const user = await account();
    expect(
      await service.signIn({ email: "ada@example.com", password: PASSWORD, app: "admin" }),
    ).toEqual({
      ok: false,
      error: "Incorrect email or password.",
    });
    repo.roles.set(user.id, ["finance_admin"]);
    const result = await service.signIn({
      email: "ada@example.com",
      password: PASSWORD,
      app: "admin",
    });
    expect(result).toMatchObject({ ok: true, user: { adminRoles: ["finance_admin"] } });
  });

  it("renews web sessions in the second half of their life; admin sessions expire", async () => {
    const user = await account();
    repo.roles.set(user.id, ["support_admin"]);
    const web = await service.signIn({ email: "ada@example.com", password: PASSWORD, app: "web" });
    const admin = await service.signIn({
      email: "ada@example.com",
      password: PASSWORD,
      app: "admin",
    });
    if (!web.ok || !admin.ok) throw new Error("sign-in failed");

    clock += SESSION_TTL_MS.web / 2 + 1000;
    const renewed = await service.getSession(web.token, "web");
    expect(renewed?.renewedUntil?.getTime()).toBe(clock + SESSION_TTL_MS.web);
    expect(await service.getSession(admin.token, "admin")).toBeNull(); // 8 hours long gone
  });

  it("signs out", async () => {
    await account();
    const result = await service.signIn({
      email: "ada@example.com",
      password: PASSWORD,
      app: "web",
    });
    if (!result.ok) throw new Error(result.error);
    await service.signOut(result.token);
    expect(await service.getSession(result.token, "web")).toBeNull();
  });
});

describe("password reset and email verification", () => {
  it("resets once with a short-lived token and signs every session out", async () => {
    await account();
    const session = await service.signIn({
      email: "ada@example.com",
      password: PASSWORD,
      app: "web",
    });
    const token = (await service.requestPasswordReset("ada@example.com"))!;
    expect(token).toBeTruthy();
    expect(await service.requestPasswordReset("nobody@example.com")).toBeNull();

    expect(await service.resetPassword(token, "a brand new password")).toEqual({ ok: true });
    expect(await service.resetPassword(token, "another new password")).toMatchObject({ ok: false });
    expect(await service.getSession(session.ok ? session.token : "", "web")).toBeNull();
    expect(
      await service.signIn({
        email: "ada@example.com",
        password: "a brand new password",
        app: "web",
      }),
    ).toMatchObject({ ok: true });
  });

  it("rejects an expired reset link", async () => {
    await account();
    const token = (await service.requestPasswordReset("ada@example.com"))!;
    clock += 61 * 60 * 1000;
    expect(await service.resetPassword(token, "a brand new password")).toMatchObject({ ok: false });
  });

  it("verifies an email address once", async () => {
    const user = await account();
    const token = await service.issueEmailVerification(user.id);
    expect(await service.verifyEmail(token)).toBe(true);
    expect(await service.verifyEmail(token)).toBe(false);
    expect(repo.users.get(user.id)!.emailVerifiedAt).not.toBeNull();
  });
});

describe("admin permissions", () => {
  it("gives each role only its permissions; super admins have all", () => {
    expect(can(["finance_admin"], "payments.read")).toBe(true);
    expect(can(["finance_admin"], "ai.manage")).toBe(false);
    expect(can(["support_admin"], "users.manage")).toBe(false);
    expect(can(["platform_admin"], "roles.manage")).toBe(false);
    expect(can(["super_admin"], "roles.manage")).toBe(true);
    expect([...permissionsOf(["nutritionist_admin", "vendor_admin"])]).toEqual(
      expect.arrayContaining(["nutritionists.verify", "vendors.verify"]),
    );
    expect(can([], "audit.read")).toBe(false);
  });
});
