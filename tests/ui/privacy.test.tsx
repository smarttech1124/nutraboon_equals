// @vitest-environment jsdom
import { cleanup, render, screen as page, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => {} }));
const services = vi.fn<() => Promise<string[]>>();
vi.mock("@/lib/privacy/processors", () => ({ currentAIServices: () => services() }));

const { default: PrivacyPage } = await import("@/app/privacy/page");

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

async function renderPage() {
  render(await PrivacyPage());
}

/** The notice itself; the site footer repeats some wording (call 112, contact email). */
const screen = {
  ...page,
  getByText: (...a: Parameters<typeof page.getByText>) =>
    within(page.getByRole("main")).getByText(...a),
  getByRole: (...a: Parameters<typeof page.getByRole>) =>
    within(page.getByRole("main")).getByRole(...a),
  queryByText: (...a: Parameters<typeof page.queryByText>) =>
    within(page.getByRole("main")).queryByText(...a),
};

describe("privacy notice", () => {
  it("states retention, voice, device storage and the AI services in use", async () => {
    services.mockResolvedValue(["XEELAA", "Google (Gemini)"]);
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Privacy" })).toBeInTheDocument();
    expect(screen.getByText(/deleted 2 hours after your last message/)).toBeInTheDocument();
    expect(screen.getByText("XEELAA and Google (Gemini)")).toBeInTheDocument();
    expect(screen.getByText(/If the first is unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/browser's own speech service/)).toBeInTheDocument();
    expect(screen.getByText(/saved in your browser only/)).toBeInTheDocument();
    expect(screen.getByText(/call 112/)).toBeInTheDocument();
  });

  it("shows the operator's contact when configured, and says it is missing otherwise", async () => {
    services.mockResolvedValue(["Google (Gemini)"]);
    await renderPage();
    expect(
      screen.getByText(/Contact details for privacy questions will be added/),
    ).toBeInTheDocument();
    cleanup();

    vi.stubEnv("PRIVACY_CONTROLLER_NAME", "Nutraboom Ltd");
    vi.stubEnv("PRIVACY_CONTACT_EMAIL", "privacy@example.org");
    await renderPage();
    expect(screen.getByText(/operated by Nutraboom Ltd/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "privacy@example.org" })).toHaveAttribute(
      "href",
      "mailto:privacy@example.org",
    );
  });

  it("has no axe violations", async () => {
    services.mockResolvedValue(["Google (Gemini)"]);
    await renderPage();
    const results = await axe.run(document.body, {
      rules: {
        "color-contrast": { enabled: false },
        "document-title": { enabled: false },
        "html-has-lang": { enabled: false },
        region: { enabled: false },
      },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
