// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AddAdminState } from "@admin/app/(portal)/admins/actions";
import { Pagination } from "@admin/components/pagination";
import { AddAdminForm, DeleteUserButton } from "@admin/components/users";
import { paging } from "@admin/lib/pagination";
import type { ActionState } from "@/components/ui/action-form";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const axeRules = {
  rules: {
    "color-contrast": { enabled: false },
    "document-title": { enabled: false },
    "html-has-lang": { enabled: false },
    region: { enabled: false },
  },
};

describe("Pagination", () => {
  it("keeps other query parameters and marks the current page", () => {
    render(<Pagination path="/users" query={{ q: "ada" }} paging={paging(2, 95)} />);
    const nav = screen.getByRole("navigation", { name: "Pages" });
    expect(within(nav).getByText("Showing 21–40 of 95")).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Page 2" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/users?q=ada",
    );
    expect(within(nav).getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/users?q=ada&page=3",
    );
  });

  it("shows only the count for a single page, and nothing for an empty table", () => {
    const { rerender } = render(<Pagination path="/audit" paging={paging(1, 7)} />);
    expect(screen.getByText("Showing 1–7 of 7")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    rerender(<Pagination path="/audit" paging={paging(1, 0)} />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});

describe("DeleteUserButton", () => {
  it("asks first and does nothing when cancelled", async () => {
    const action = vi.fn(async (): Promise<ActionState> => ({ status: "success", message: "" }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    const user = userEvent.setup();
    render(<DeleteUserButton action={action} userId="u1" name="Ada" email="ada@example.test" />);
    await user.click(screen.getByRole("button", { name: "Delete Ada" }));
    expect(confirm.mock.calls[0]![0]).toMatch(/Delete Ada \(ada@example\.test\) permanently/);
    expect(action).not.toHaveBeenCalled();
  });

  it("deletes after confirmation and shows the result", async () => {
    const ids: string[] = [];
    const action = vi.fn(async (_p: ActionState, data: FormData): Promise<ActionState> => {
      ids.push(String(data.get("userId")));
      return { status: "success", message: "Account deleted." };
    });
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    const user = userEvent.setup();
    render(<DeleteUserButton action={action} userId="u1" name="Ada" email="ada@example.test" />);
    await user.click(screen.getByRole("button", { name: "Delete Ada" }));
    expect(await screen.findByText("Account deleted.")).toBeInTheDocument();
    expect(ids).toEqual(["u1"]);
  });
});

describe("AddAdminForm", () => {
  it("keeps the email and role after an error, never the password", async () => {
    const action = vi.fn(async (_p: AddAdminState, data: FormData): Promise<AddAdminState> => ({
      status: "error",
      message: "There is no account with that email. Add a name and a temporary password.",
      fieldErrors: { name: "Enter a name for the new account." },
      values: { email: String(data.get("email")), role: String(data.get("role")), name: "" },
    }));
    const user = userEvent.setup();
    render(<AddAdminForm action={action} />);
    await user.type(screen.getByLabelText("Email"), "new@example.test");
    await user.selectOptions(screen.getByLabelText("Role"), "Support administrator");
    await user.type(screen.getByLabelText(/Temporary password/), "temporary-pass-1");
    await user.click(screen.getByRole("button", { name: "Add administrator" }));
    expect(await screen.findByText("Enter a name for the new account.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("new@example.test");
    expect(screen.getByLabelText("Role")).toHaveValue("support_admin");
    expect(screen.getByLabelText(/Temporary password/)).toHaveValue("");
  });

  it("has no axe violations", async () => {
    render(<AddAdminForm action={vi.fn()} />);
    expect((await axe.run(document.body, axeRules)).violations).toEqual([]);
  });
});
