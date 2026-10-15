// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server-side protection of the account dashboard, profile actions and the
 * Meal Planner (ADR-075). The pages and actions check the session
 * themselves; hiding links in the header is never the protection.
 */

class Redirect extends Error {
  constructor(public readonly to: string) {
    super(`redirect:${to}`);
  }
}

const user = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
  usePathname: () => "/planner",
}));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/next", () => ({
  currentUser: () => user(),
  allowAttempt: async () => true,
  getAuthService: () => ({}),
  startSession: async () => {},
}));
const flags = vi.fn(async () => true);
vi.mock("@/lib/billing", () => ({
  getEntitlementService: () => ({ isEnabled: () => flags(), entitlementsFor: async () => ({}) }),
}));
const update = vi.fn();
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ user: { update } }) }));

const { default: AccountLayout } = await import("@/app/(account)/account/layout");
const { default: PlannerPage } = await import("@/app/planner/page");
const { updateProfileAction, changePasswordAction } =
  await import("@/app/(account)/account/profile/actions");

beforeEach(() => {
  user.mockReset();
  update.mockReset();
  flags.mockResolvedValue(true);
});
afterEach(cleanup);

describe("signed-out visitors", () => {
  beforeEach(() => user.mockResolvedValue(null));

  it("are sent to log in from the account dashboard, keeping the destination", async () => {
    await expect(AccountLayout({ children: null })).rejects.toThrow(
      "redirect:/sign-in?next=/account",
    );
  });

  it("cannot change a profile or password through the actions", async () => {
    const fd = new FormData();
    fd.set("name", "Someone Else");
    expect(await updateProfileAction({ status: "idle", message: "" }, fd)).toMatchObject({
      status: "error",
      message: "Please sign in again.",
    });
    expect(await changePasswordAction({ status: "idle", message: "" }, fd)).toMatchObject({
      status: "error",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("see the Meal Planner introduction, and the call to action returns them to it", async () => {
    render(await PlannerPage());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Plan your meals/);
    expect(screen.getByRole("link", { name: "Create my meal plan" })).toHaveAttribute(
      "href",
      "/sign-up?next=/planner",
    );
    expect(screen.getByRole("link", { name: /Log in/ })).toHaveAttribute(
      "href",
      "/sign-in?next=/planner",
    );
  });
});

describe("signed-in people", () => {
  it("can only update their own profile, with validation", async () => {
    user.mockResolvedValue({
      id: "u1",
      email: "a@example.test",
      name: "A",
      emailVerified: true,
      adminRoles: [],
    });
    const empty = new FormData();
    empty.set("name", "  ");
    empty.append("needs", "read_aloud");
    const bad = await updateProfileAction({ status: "idle", message: "" }, empty);
    expect(bad.fieldErrors?.name).toBe("Enter your name.");
    expect(bad.values?.needs).toEqual(["read_aloud"]);
    expect(update).not.toHaveBeenCalled();

    const good = new FormData();
    good.set("name", "Ada Obi");
    good.append("needs", "read_aloud");
    good.append("needs", "not-a-need");
    good.set("id", "someone-else");
    expect((await updateProfileAction({ status: "idle", message: "" }, good)).status).toBe(
      "success",
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { name: "Ada Obi", accessibilityNeeds: ["read_aloud"] },
    });
  });
});
