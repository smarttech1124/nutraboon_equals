// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FormState } from "@admin/app/(portal)/ai/actions";
import type { SignInState } from "@admin/app/sign-in/actions";
import { AdminSignInForm } from "@admin/app/sign-in/form";
import { AddConfigForm, ConfigActions, type ProviderOption } from "@admin/components/ai/forms";

const providers: ProviderOption[] = [
  {
    value: "gemini",
    label: "Google Gemini",
    modelSuggestions: ["gemini-3.8-flash"],
    keyFormatHint: "a Google AI Studio key",
  },
  {
    value: "openai",
    label: "OpenAI",
    modelSuggestions: [],
    keyFormatHint: "an OpenAI key starting with sk-",
  },
];

const KEY = "sk-proj-AAAAAAAAAAAAAAAAAAAAAAAA9X2A";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function noA11yViolations() {
  const results = await axe.run(document.body, {
    rules: {
      "color-contrast": { enabled: false },
      "document-title": { enabled: false },
      "html-has-lang": { enabled: false },
      region: { enabled: false },
    },
  });
  expect(results.violations.map((v) => v.id)).toEqual([]);
}

describe("AddConfigForm", () => {
  it("submits provider, model, name and key, then shows the result without the key", async () => {
    const seen: Record<string, string>[] = [];
    const action = vi.fn(async (_prev: FormState, data: FormData): Promise<FormState> => {
      seen.push(Object.fromEntries([...data.entries()].map(([k, v]) => [k, String(v)])));
      return { status: "success", message: "Key verified and saved." };
    });
    const user = userEvent.setup();
    render(<AddConfigForm action={action} providers={providers} />);

    await user.selectOptions(screen.getByLabelText("Provider"), "openai");
    expect(screen.getByText(/an OpenAI key starting with sk-/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Model ID"), "gpt-test");
    await user.type(screen.getByLabelText(/Name/), "Main");
    const keyField = screen.getByLabelText("API key");
    expect(keyField).toHaveAttribute("type", "password");
    expect(keyField).toHaveAttribute("autocomplete", "off");
    await user.type(keyField, KEY);
    await user.click(screen.getByLabelText(/Use this configuration/));
    await user.click(screen.getByRole("button", { name: "Verify and save" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Key verified and saved.");
    expect(seen[0]).toEqual({
      provider: "openai",
      model: "gpt-test",
      label: "Main",
      apiKey: KEY,
      activate: "on",
    });
    // React resets the form after the action, so the key is gone from the page.
    expect(screen.getByLabelText("API key")).toHaveValue("");
    expect(document.body.innerHTML).not.toContain(KEY);
  });

  it("shows a verification error as an alert", async () => {
    const action = vi.fn(async (): Promise<FormState> => ({
      status: "error",
      message: "The provider rejected this API key.",
    }));
    const user = userEvent.setup();
    render(<AddConfigForm action={action} providers={providers} />);
    await user.type(screen.getByLabelText("Model ID"), "gemini-3.8-flash");
    await user.type(screen.getByLabelText("API key"), "AIzaSyD-0123456789abcdefghijklmnopqrs");
    await user.click(screen.getByRole("button", { name: "Verify and save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("rejected this API key");
  });

  it("has no axe violations", async () => {
    render(<AddConfigForm action={vi.fn()} providers={providers} />);
    await noA11yViolations();
  });
});

describe("ConfigActions", () => {
  const config = {
    id: "cfg-1",
    name: "Main",
    status: "verified" as const,
    isActive: false,
    model: "gpt-test",
  };

  it("activates an inactive verified configuration", async () => {
    const intents: string[] = [];
    const action = vi.fn(async (_p: FormState, data: FormData): Promise<FormState> => {
      intents.push(`${data.get("intent")}:${data.get("id")}`);
      return { status: "success", message: "Now using OpenAI gpt-test." };
    });
    const user = userEvent.setup();
    render(<ConfigActions action={action} config={config} />);
    await user.click(screen.getByRole("button", { name: "Activate Main" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Now using OpenAI gpt-test.");
    expect(intents).toEqual(["activate:cfg-1"]);
  });

  it("offers Deactivate, not Activate, for the active configuration", () => {
    render(<ConfigActions action={vi.fn()} config={{ ...config, isActive: true }} />);
    expect(screen.getByRole("button", { name: "Deactivate Main" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activate Main" })).toBeNull();
  });

  it("does not offer Activate for a failed key", () => {
    render(<ConfigActions action={vi.fn()} config={{ ...config, status: "failed" }} />);
    expect(screen.queryByRole("button", { name: "Activate Main" })).toBeNull();
    expect(screen.getByRole("button", { name: "Re-check Main" })).toBeInTheDocument();
  });

  it("asks before deleting a key and does nothing when cancelled", async () => {
    const action = vi.fn(async (): Promise<FormState> => ({
      status: "success",
      message: "Deleted.",
    }));
    const confirm = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const user = userEvent.setup();
    render(<ConfigActions action={action} config={config} />);

    await user.click(screen.getByRole("button", { name: "Delete key for Main" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(action).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete key for Main" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Deleted.");
    expect(action).toHaveBeenCalledOnce();
  });

  it("changes the model through its own form", async () => {
    const seen: string[] = [];
    const action = vi.fn(async (_p: FormState, data: FormData): Promise<FormState> => {
      seen.push(`${data.get("intent")}:${data.get("model")}`);
      return { status: "success", message: "Model changed to gpt-new." };
    });
    const user = userEvent.setup();
    render(<ConfigActions action={action} config={config} />);
    await user.click(screen.getByRole("button", { name: "Change model for Main" }));
    const field = screen.getByLabelText("New model ID");
    await user.clear(field);
    await user.type(field, "gpt-new");
    await user.click(screen.getByRole("button", { name: "Verify and change" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Model changed to gpt-new.");
    expect(seen).toEqual(["changeModel:gpt-new"]);
  });

  it("shows nothing to do for a revoked key", () => {
    render(<ConfigActions action={vi.fn()} config={{ ...config, status: "revoked" }} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("AdminSignInForm", () => {
  it("shows a sign-in error and has no axe violations", async () => {
    const action = vi.fn(async (): Promise<SignInState> => ({
      status: "error",
      message: "Incorrect email or password.",
    }));
    const user = userEvent.setup();
    render(<AdminSignInForm action={action} />);
    await user.type(screen.getByLabelText("Email"), "admin@example.test");
    await user.type(screen.getByLabelText("Password"), "nope");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
    await noA11yViolations();
  });
});
