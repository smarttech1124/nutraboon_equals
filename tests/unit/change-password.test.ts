import { describe, expect, it } from "vitest";
import { InMemoryAuthRepository } from "@/lib/auth/repository";
import { AuthService, NO_PASSWORD } from "@/lib/auth/service";

/** Password change from the account dashboard (ADR-075). */
describe("changePassword", () => {
  async function setup() {
    const repo = new InMemoryAuthRepository();
    const auth = new AuthService(repo);
    const made = await auth.signUp({
      email: "ada@example.test",
      name: "Ada",
      password: "first-password",
    });
    if (!made.ok) throw new Error("setup");
    return { repo, auth, id: made.user.id };
  }

  it("needs the current password and a valid, different new one", async () => {
    const { auth, id } = await setup();
    expect((await auth.changePassword(id, "wrong-password", "second-password")).ok).toBe(false);
    expect((await auth.changePassword(id, "first-password", "short")).ok).toBe(false);
    expect((await auth.changePassword(id, "first-password", "first-password")).ok).toBe(false);
    expect((await auth.changePassword(id, "first-password", "second-password")).ok).toBe(true);
    expect(
      (await auth.signIn({ email: "ada@example.test", password: "first-password", app: "web" })).ok,
    ).toBe(false);
    expect(
      (await auth.signIn({ email: "ada@example.test", password: "second-password", app: "web" }))
        .ok,
    ).toBe(true);
  });

  it("ends every existing session", async () => {
    const { auth, id } = await setup();
    const s = await auth.signIn({
      email: "ada@example.test",
      password: "first-password",
      app: "web",
    });
    expect(s.ok).toBe(true);
    await auth.changePassword(id, "first-password", "second-password");
    expect(s.ok && (await auth.getSession(s.token, "web"))).toBeNull();
  });

  it("sends accounts without a password to the reset email", async () => {
    const { repo, auth, id } = await setup();
    await repo.updatePassword(id, NO_PASSWORD);
    const result = await auth.changePassword(id, "", "second-password");
    expect(!result.ok && result.error).toMatch(/Forgot your password/);
  });
});
