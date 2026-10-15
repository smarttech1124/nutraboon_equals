import { appUrl } from "./index";

/**
 * Branded transactional emails (ADR-086). Each template returns an HTML
 * version in the Nutraboom Equals look (cream page, white card, green
 * button, the Equals logo) and a plain-text version with the same words, so
 * every inbox, screen reader and text-only client gets the full message.
 *
 * Email clients ignore most modern CSS, so the HTML uses tables and inline
 * styles, a 600px card that shrinks on phones, and system fonts with web-safe
 * fallbacks. All text passed in is escaped.
 */

export type EmailTemplate = "verify_email" | "reset_password" | "notification";

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
  template: EmailTemplate;
};

const COLORS = {
  canvas: "#fefae0",
  surface: "#ffffff",
  ink: "#264653",
  muted: "#4d626b",
  brand: "#2d6a4f",
  gold: "#e9c46a",
  line: "#e6ddbb",
};

const FONT = "'DM Sans', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const DISPLAY = "'Playfair Display', Georgia, 'Times New Roman', serif";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type Layout = {
  subject: string;
  /** Inbox preview line, hidden in the body. */
  preheader: string;
  heading: string;
  paragraphs: string[];
  action?: { label: string; url: string };
  /** Small print under the button, e.g. when the link expires. */
  note?: string;
  template: EmailTemplate;
};

function render(layout: Layout, site = appUrl()): RenderedEmail {
  const p = (text: string) =>
    `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${COLORS.ink};">${escapeHtml(text)}</p>`;
  const button = layout.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
        <tr><td style="border-radius:999px;background:${COLORS.brand};">
          <a href="${escapeHtml(layout.action.url)}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(layout.action.label)}</a>
        </td></tr>
      </table>
      <p style="margin:0 0 16px;font-family:${FONT};font-size:13px;line-height:1.5;color:${COLORS.muted};">If the button does not work, copy this link into your browser:<br><a href="${escapeHtml(layout.action.url)}" style="color:${COLORS.brand};word-break:break-all;">${escapeHtml(layout.action.url)}</a></p>`
    : "";
  const note = layout.note
    ? `<p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.5;color:${COLORS.muted};">${escapeHtml(layout.note)}</p>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(layout.subject)}</title>
<style>
  @media (max-width: 620px) {
    .card { width: 100% !important; border-radius: 0 !important; }
    .pad { padding: 24px 20px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${COLORS.canvas};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(layout.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.canvas};">
  <tr><td align="center" style="padding:24px 0;">
    <table role="presentation" class="card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${COLORS.surface};border:1px solid ${COLORS.line};border-radius:20px;overflow:hidden;">
      <tr><td style="height:6px;background:${COLORS.gold};font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td class="pad" style="padding:28px 40px 8px;">
        <a href="${escapeHtml(site)}" style="text-decoration:none;"><img src="${escapeHtml(site)}/brand/logo.png" width="170" height="53" alt="Nutraboom Equals" style="display:block;border:0;height:auto;"></a>
      </td></tr>
      <tr><td class="pad" style="padding:16px 40px 32px;">
        <h1 style="margin:0 0 16px;font-family:${DISPLAY};font-size:26px;line-height:1.25;font-weight:700;color:${COLORS.ink};">${escapeHtml(layout.heading)}</h1>
        ${layout.paragraphs.map(p).join("\n        ")}
        ${button}
        ${note}
      </td></tr>
      <tr><td class="pad" style="padding:20px 40px 28px;background:${COLORS.ink};">
        <p style="margin:0 0 6px;font-family:${FONT};font-size:13px;line-height:1.5;color:${COLORS.canvas};">Nutraboom Equals · AI-powered nutrition for Nigeria</p>
        <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.5;color:#c9d6d2;">General nutrition information, not medical advice. In an emergency, call 112. You received this email because of your Nutraboom Equals account.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    layout.heading,
    "",
    ...layout.paragraphs.flatMap((para) => [para, ""]),
    ...(layout.action ? [`${layout.action.label}: ${layout.action.url}`, ""] : []),
    ...(layout.note ? [layout.note, ""] : []),
    "—",
    "Nutraboom Equals · AI-powered nutrition for Nigeria",
    "General nutrition information, not medical advice. In an emergency, call 112.",
  ].join("\n");

  return { subject: layout.subject, html, text, template: layout.template };
}

export function verifyEmailMessage(token: string, site = appUrl()): RenderedEmail {
  return render(
    {
      template: "verify_email",
      subject: "Confirm your Nutraboom Equals email",
      preheader: "One click to confirm your email address.",
      heading: "Confirm your email address",
      paragraphs: [
        "Welcome to Nutraboom Equals. Please confirm that this is your email address, so we can keep your account safe and send you important updates.",
      ],
      action: {
        label: "Confirm my email",
        url: `${site}/verify-email?token=${encodeURIComponent(token)}`,
      },
      note: "The link works once and expires in 48 hours. If you did not create an account, you can ignore this email.",
    },
    site,
  );
}

export function resetPasswordMessage(token: string, site = appUrl()): RenderedEmail {
  return render(
    {
      template: "reset_password",
      subject: "Reset your Nutraboom Equals password",
      preheader: "Choose a new password for your account.",
      heading: "Reset your password",
      paragraphs: ["Someone asked to reset the password for your Nutraboom Equals account."],
      action: {
        label: "Choose a new password",
        url: `${site}/reset-password?token=${encodeURIComponent(token)}`,
      },
      note: "The link works once and expires in 1 hour. If you did not ask for this, ignore this email: your password stays the same.",
    },
    site,
  );
}

/** Notifications have fixed wording chosen by the app, never health details (ADR-064). */
export function notificationMessage(
  message: { title: string; body: string; link?: string },
  site = appUrl(),
): RenderedEmail {
  return render(
    {
      template: "notification",
      subject: message.title,
      preheader: message.body.slice(0, 120),
      heading: message.title,
      paragraphs: message.body
        .split(/\n{2,}/)
        .map((s) => s.trim())
        .filter(Boolean),
      ...(message.link
        ? { action: { label: "Open Nutraboom Equals", url: `${site}${message.link}` } }
        : {}),
    },
    site,
  );
}
