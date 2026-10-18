/**
 * Outgoing email (ADR-061, ADR-065): account links and notifications. Sent
 * through Resend when RESEND_API_KEY and EMAIL_FROM are set. Without them, in
 * development the message is written to the server log so the flows can be
 * tested; in production, sending reports "unavailable" and the screens say so
 * instead of pretending an email went out.
 */

export type Email = {
  to: string;
  subject: string;
  text: string;
  /** The branded version (lib/email/templates.ts); text is always sent too. */
  html?: string;
  /** Which template, for delivery logs (never the address or content). */
  template?: string;
  /** Makes a retried send deliver once (Resend Idempotency-Key, 1–256 characters). */
  idempotencyKey?: string;
};

export interface EmailSender {
  readonly available: boolean;
  send(email: Email): Promise<void>;
}

/** Development only: prints the email (including its one-time link) to the server log. */
export class DevLogEmailSender implements EmailSender {
  readonly available = true;
  async send(email: Email): Promise<void> {
    console.info(
      `\n--- email (development only, not sent) ---\nTo: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n---\n`,
    );
  }
}

export class UnavailableEmailSender implements EmailSender {
  readonly available = false;
  async send(): Promise<void> {
    throw new Error("No email provider is configured");
  }
}

/** A Resend failure carrying only the status: error bodies can quote the request. */
export class EmailSendError extends Error {
  constructor(readonly status: number | null) {
    super(`Email send failed (${status ?? "network"})`);
    this.name = "EmailSendError";
  }
}

/**
 * Resend (https://resend.com/docs/api-reference/emails/send-email): HTML with
 * a plain-text alternative. Each send is logged with its template, Resend's
 * message ID and the outcome; never the address or the content (ADR-086).
 */
export class ResendEmailSender implements EmailSender {
  readonly available = true;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(email: Email): Promise<void> {
    let response: Response;
    try {
      response = await this.fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...(email.idempotencyKey
            ? { "Idempotency-Key": email.idempotencyKey.slice(0, 256) }
            : {}),
        },
        body: JSON.stringify({
          from: this.from,
          to: [email.to],
          subject: email.subject,
          text: email.text,
          ...(email.html ? { html: email.html } : {}),
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      logDelivery("email_failed", email, { status: null });
      throw new EmailSendError(null);
    }
    if (!response.ok) {
      // Resend's reason (e.g. "validation_error: The x.com domain is not
      // verified") explains configuration problems; addresses are removed.
      const body = (await response.json().catch(() => null)) as {
        name?: unknown;
        message?: unknown;
      } | null;
      const reason = [body?.name, body?.message]
        .filter((part): part is string => typeof part === "string")
        .join(": ")
        .replace(/[^\s<>()"']+@[^\s<>()"']+/g, "[address]")
        .slice(0, 300);
      logDelivery("email_failed", email, { status: response.status, reason: reason || null });
      throw new EmailSendError(response.status);
    }
    const body = (await response.json().catch(() => null)) as { id?: unknown } | null;
    logDelivery("email_sent", email, { id: typeof body?.id === "string" ? body.id : null });
  }
}

function logDelivery(
  event: "email_sent" | "email_failed",
  email: Email,
  detail: { id?: string | null; status?: number | null; reason?: string | null },
) {
  const line = JSON.stringify({
    event,
    provider: "resend",
    template: email.template ?? "other",
    ...detail,
  });
  if (event === "email_failed") console.error(line);
  else console.info(line);
}

export function getEmailSender(env: Record<string, string | undefined> = process.env): EmailSender {
  if (env.RESEND_API_KEY && env.EMAIL_FROM) {
    return new ResendEmailSender(env.RESEND_API_KEY, env.EMAIL_FROM);
  }
  return env.NODE_ENV === "production" ? new UnavailableEmailSender() : new DevLogEmailSender();
}

/** The site's public address, for links in emails. */
export function appUrl(env: Record<string, string | undefined> = process.env): string {
  return (env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}
