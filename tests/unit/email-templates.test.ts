import { describe, expect, it, vi } from "vitest";
import { ResendEmailSender } from "@/lib/email";
import {
  escapeHtml,
  notificationMessage,
  resetPasswordMessage,
  verifyEmailMessage,
} from "@/lib/email/templates";

const SITE = "https://nutraboom-equals.vercel.app";

describe("branded email templates (ADR-086)", () => {
  it("builds the verification email in HTML and plain text with the same link", () => {
    const email = verifyEmailMessage("tok/en+1", SITE);
    const link = `${SITE}/verify-email?token=tok%2Fen%2B1`;
    expect(email.subject).toBe("Confirm your Nutraboom Equals email");
    expect(email.template).toBe("verify_email");
    expect(email.html).toContain(`href="${link}"`);
    expect(email.html).toContain(`src="${SITE}/brand/logo.png"`);
    expect(email.html).toContain('alt="Nutraboom Equals"');
    expect(email.html).toContain("Confirm my email");
    expect(email.text).toContain(`Confirm my email: ${link}`);
    expect(email.text).toContain("expires in 48 hours");
  });

  it("builds the password reset email", () => {
    const email = resetPasswordMessage("abc", SITE);
    expect(email.html).toContain(`${SITE}/reset-password?token=abc`);
    expect(email.text).toMatch(/expires in 1 hour/);
  });

  it("escapes notification text and links to the app", () => {
    const email = notificationMessage(
      {
        title: "Session <b>confirmed</b>",
        body: "See you on Monday & bring notes.",
        link: "/account",
      },
      SITE,
    );
    expect(email.html).not.toContain("<b>confirmed</b>");
    expect(email.html).toContain("Session &lt;b&gt;confirmed&lt;/b&gt;");
    expect(email.html).toContain("Monday &amp; bring");
    expect(email.html).toContain(`href="${SITE}/account"`);
    expect(email.text).toContain(`Open Nutraboom Equals: ${SITE}/account`);
    expect(escapeHtml(`"'`)).toBe("&quot;&#39;");
  });

  it("sends HTML with its text alternative and logs delivery without the address", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ id: "re_123" }));
    const sender = new ResendEmailSender("re_test", "Equals <hello@example.test>", fetchMock);
    await sender.send({ to: "ada@example.test", ...verifyEmailMessage("t", SITE) });
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
    expect(body.html).toContain("<!doctype html>");
    expect(body.text).toContain("Confirm your email address");
    expect(body).not.toHaveProperty("template");
    const line = info.mock.calls.map((c) => String(c[0])).find((l) => l.includes("email_sent"))!;
    expect(JSON.parse(line)).toEqual({
      event: "email_sent",
      provider: "resend",
      template: "verify_email",
      id: "re_123",
    });
    expect(line).not.toContain("ada@");
    info.mockRestore();
  });
});
