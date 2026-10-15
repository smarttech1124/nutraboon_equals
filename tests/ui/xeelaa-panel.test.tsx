// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FormState } from "@admin/app/(portal)/ai/actions";
import { AddConfigForm, XEELAA_PROVIDER, type ProviderOption } from "@admin/components/ai/forms";
import { XeelaaRowActions } from "@admin/components/ai/xeelaa";
import { describeXeelaa, type XeelaaView } from "@admin/lib/xeelaa-status";

const KEY = "xla_k1d2e3:s3cr3tS3cr3tS3cr3t9Z";
const ok = (message: string, extra: Partial<FormState> = {}) =>
  vi.fn(async (): Promise<FormState> => ({ status: "success", message, ...extra }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const verifiedOff: XeelaaView = {
  configured: true,
  keyHint: "xla_••••••••3t9Z",
  enabled: false,
  status: "verified",
  active: false,
  lastChecked: "4 Oct 2026, 10:00",
};

const providers: ProviderOption[] = [
  {
    value: "gemini",
    label: "Google Gemini",
    modelSuggestions: ["gemini-3.8-flash"],
    keyFormatHint: "a Google AI Studio key",
  },
  {
    value: XEELAA_PROVIDER,
    label: "XEELAA API",
    modelSuggestions: [],
    keyFormatHint: "a XEELAA key",
  },
];

describe("XEELAA in Add an API key (ADR-080)", () => {
  it("is a provider option with no model or name field, and sends only the key", async () => {
    const seen: Record<string, string>[] = [];
    const action = vi.fn(async (_p: FormState, data: FormData): Promise<FormState> => {
      seen.push(Object.fromEntries([...data.entries()].map(([k, v]) => [k, String(v)])));
      return { status: "success", message: "XEELAA key verified and saved." };
    });
    const user = userEvent.setup();
    render(<AddConfigForm action={action} providers={providers} />);
    expect(screen.getByLabelText("Model ID")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Provider"), "XEELAA API");
    expect(screen.queryByLabelText("Model ID")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
    expect(screen.getByText(/Use XEELAA for chat as soon as it is verified/)).toBeInTheDocument();

    await user.type(screen.getByLabelText("API key"), KEY);
    await user.click(screen.getByRole("button", { name: "Verify and save" }));
    expect(await screen.findByRole("status")).toHaveTextContent("XEELAA key verified and saved.");
    expect(seen).toEqual([{ provider: "xeelaa", apiKey: KEY }]);
    expect(document.body.innerHTML).not.toContain(KEY);
  });
});

describe("XEELAA row actions", () => {
  it("cannot be switched on before a verified key is saved", () => {
    render(
      <XeelaaRowActions
        view={{ configured: true, enabled: false, active: false, status: "invalid" }}
        action={vi.fn()}
      />,
    );
    const toggle = screen.getByRole("switch", { name: /Use XEELAA API/ });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).toBeDisabled();
  });

  it("switches on with the enable intent", async () => {
    const intents: string[] = [];
    const manage = vi.fn(async (_p: FormState, data: FormData): Promise<FormState> => {
      intents.push(String(data.get("intent")));
      return { status: "success", message: "XEELAA is on." };
    });
    const user = userEvent.setup();
    render(<XeelaaRowActions view={verifiedOff} action={manage} />);
    await user.click(screen.getByRole("switch", { name: /Use XEELAA API/ }));
    expect(intents).toEqual(["enable"]);
    expect(await screen.findByRole("status")).toHaveTextContent("XEELAA is on.");
  });

  it("describes each state in plain language", () => {
    expect(describeXeelaa({ configured: false, enabled: false, active: false }).label).toBe(
      "Not set up",
    );
    expect(describeXeelaa({ ...verifiedOff, enabled: true, active: true })).toMatchObject({
      label: "Active",
      text: expect.stringMatching(/falls back to the active configuration/),
    });
    expect(describeXeelaa({ ...verifiedOff, enabled: true, status: "invalid" }).label).toBe(
      "Key not working",
    );
  });

  it("shows usage figures", async () => {
    const user = userEvent.setup();
    render(
      <XeelaaRowActions
        view={verifiedOff}
        action={ok("Usage from XEELAA:", { usage: [{ label: "requests today", value: "42" }] })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Show usage" }));
    expect(await screen.findByText("requests today")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("asks before deleting the key", async () => {
    const manage = ok("Deleted.");
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    const user = userEvent.setup();
    render(<XeelaaRowActions view={verifiedOff} action={manage} />);
    await user.click(screen.getByRole("button", { name: "Delete key" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(manage).not.toHaveBeenCalled();
  });

  it("has no axe violations", async () => {
    render(<XeelaaRowActions view={verifiedOff} action={vi.fn()} />);
    const results = await axe.run(document.body, {
      rules: {
        "color-contrast": { enabled: false },
        "document-title": { enabled: false },
        "html-has-lang": { enabled: false },
        region: { enabled: false },
      },
    });
    expect(results.violations).toEqual([]);
  });
});
