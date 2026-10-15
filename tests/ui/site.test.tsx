// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

const pathname = vi.fn(() => "/");
vi.mock("next/navigation", () => ({ usePathname: () => pathname() }));

const { SiteHeader } = await import("@/components/site/site-header");
const { SiteFrame } = await import("@/components/site/site-shell");
const { default: AboutPage } = await import("@/app/about/page");
const { contactEmail, socialLinks } = await import("@/lib/site");

/** The public site chrome and pages (ADR-070). */

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

async function axeViolations() {
  const results = await axe.run(document.body, {
    rules: {
      "color-contrast": { enabled: false },
      "document-title": { enabled: false },
      "html-has-lang": { enabled: false },
    },
  });
  return results.violations.map((v) => `${v.id}: ${v.help}`);
}

describe("site header", () => {
  it("lists the main pages and marks the current one", () => {
    pathname.mockReturnValue("/for-vendors");
    render(<SiteHeader logo="Logo" signedIn={false} />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    const names = within(nav)
      .getAllByRole("link")
      .map((a) => a.textContent);
    expect(names).toEqual([
      "Home",
      "Products",
      "Hospitals",
      "Nutritionists",
      "Vendors",
      "About us",
    ]);
    expect(within(nav).getByRole("link", { name: "Vendors" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
    expect(screen.getAllByRole("link", { name: "Log in" })[0]).toHaveAttribute("href", "/sign-in");
    expect(screen.getAllByRole("link", { name: "Sign up" })[0]).toHaveAttribute("href", "/sign-up");
  });

  it("opens and closes the small-screen menu with the button and Escape", async () => {
    pathname.mockReturnValue("/");
    const user = userEvent.setup();
    render(<SiteHeader logo="Logo" />);
    const button = screen.getByRole("button", { name: "Open menu" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await user.click(button);
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getAllByRole("navigation", { name: "Main" })).toHaveLength(2);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("offers the account to signed-in visitors", () => {
    render(<SiteHeader logo="Logo" signedIn />);
    expect(screen.getAllByRole("link", { name: "Your account" })[0]).toHaveAttribute(
      "href",
      "/account",
    );
    expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();
  });
});

describe("header sign-in state on static pages (ADR-072)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows no account links until /api/session answers, then the account link", async () => {
    let answer: (r: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((r) => (answer = r)));
    vi.stubGlobal("fetch", fetchMock);
    render(<SiteHeader logo="Logo" />);
    expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Your account" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/session",
      expect.objectContaining({ cache: "no-store" }),
    );
    answer(new Response(JSON.stringify({ signedIn: true })));
    expect((await screen.findAllByRole("link", { name: "Your account" }))[0]).toHaveAttribute(
      "href",
      "/account",
    );
  });

  it("checks again on every static page, so a sign-in or sign-out is never stale", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ signedIn: false }))),
    );
    const first = render(<SiteHeader logo="Logo" />);
    await screen.findAllByRole("link", { name: "Log in" });
    first.unmount();
    // A client-side navigation to another static page (e.g. 404, then home).
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ signedIn: true }))),
    );
    render(<SiteHeader logo="Logo" />);
    expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();
    expect((await screen.findAllByRole("link", { name: "Your account" }))[0]).toBeInTheDocument();
  });

  it("trusts the server when the page knows, without asking", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<SiteHeader logo="Logo" signedIn />);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("site footer and contact details", () => {
  it("shows only configured contact details and https social links", () => {
    expect(contactEmail({})).toBeNull();
    expect(contactEmail({ CONTACT_EMAIL: "hello@example.test" })).toBe("hello@example.test");
    expect(contactEmail({ PRIVACY_CONTACT_EMAIL: "not an email" })).toBeNull();
    expect(
      socialLinks({
        SOCIAL_LINKS: "Instagram|https://instagram.com/x, Bad|javascript:alert(1),X|http://x.com",
      }),
    ).toEqual([{ label: "Instagram", href: "https://instagram.com/x" }]);
  });

  it("frames a page with skip link, landmarks and the health notice", () => {
    vi.stubEnv("CONTACT_EMAIL", "hello@example.test");
    render(
      <SiteFrame>
        <h1>Page</h1>
      </SiteFrame>,
    );
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "hello@example.test" })).toBeInTheDocument();
    expect(within(footer).getByText(/not medical advice/)).toBeInTheDocument();
    expect(within(footer).getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
  });
});

describe("about page", () => {
  it("covers who we are, mission, offer, features, benefits, approach and a call to action", async () => {
    pathname.mockReturnValue("/about");
    render(<AboutPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/equal for everyone/);
    for (const name of [
      /Part of the Nutraboom family/,
      /One platform/,
      /Careful by design/,
      /Value for everyone/,
      /Start simple/,
      /Join us/,
    ]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
    }
    expect(await axeViolations()).toEqual([]);
  });
});
