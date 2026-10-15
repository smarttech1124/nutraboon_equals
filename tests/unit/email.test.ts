import { describe, expect, it, vi } from "vitest";
import {
  DevLogEmailSender,
  EmailSendError,
  getEmailSender,
  ResendEmailSender,
  UnavailableEmailSender,
} from "@/lib/email";

describe("email (ADR-065)", () => {
  it("chooses Resend when configured, else the log in development and nothing in production", () => {
    expect(
      getEmailSender({ RESEND_API_KEY: "re_test", EMAIL_FROM: "Equals <hello@example.test>" }),
    ).toBeInstanceOf(ResendEmailSender);
    expect(getEmailSender({ NODE_ENV: "development" })).toBeInstanceOf(DevLogEmailSender);
    expect(getEmailSender({ NODE_ENV: "production" })).toBeInstanceOf(UnavailableEmailSender);
    expect(getEmailSender({ NODE_ENV: "production", RESEND_API_KEY: "re_test" })).toBeInstanceOf(
      UnavailableEmailSender,
    );
  });

  it("sends plain text through the Resend API with an idempotency key", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ id: "email-1" }));
    const sender = new ResendEmailSender("re_test", "Equals <hello@example.test>", fetchMock);
    await sender.send({
      to: "ada@example.test",
      subject: "Hello",
      text: "Body",
      idempotencyKey: "notification/1",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test");
    expect(headers["Idempotency-Key"]).toBe("notification/1");
    expect(JSON.parse(String(init?.body))).toEqual({
      from: "Equals <hello@example.test>",
      to: ["ada@example.test"],
      subject: "Hello",
      text: "Body",
    });
  });

  it("reports failures by status only", async () => {
    const rejected = new ResendEmailSender(
      "re_test",
      "a@example.test",
      vi.fn<typeof fetch>(
        async () => new Response("validation error quoting input", { status: 422 }),
      ),
    );
    await expect(rejected.send({ to: "x@example.test", subject: "s", text: "t" })).rejects.toEqual(
      new EmailSendError(422),
    );
    const offline = new ResendEmailSender(
      "re_test",
      "a@example.test",
      vi.fn<typeof fetch>(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    await expect(
      offline.send({ to: "x@example.test", subject: "s", text: "t" }),
    ).rejects.toMatchObject({ status: null });
  });
});
