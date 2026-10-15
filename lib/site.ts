/**
 * Public contact details for the site footer and pages (ADR-070). They come
 * from the environment so the site never shows made-up addresses or social
 * accounts: anything not configured is simply left out.
 */

export type SocialLink = { label: string; href: string };

export function contactEmail(env: Record<string, string | undefined> = process.env): string | null {
  const email = (env.CONTACT_EMAIL || env.PRIVACY_CONTACT_EMAIL || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** SOCIAL_LINKS="Instagram|https://instagram.com/…,LinkedIn|https://…" (https only). */
export function socialLinks(env: Record<string, string | undefined> = process.env): SocialLink[] {
  return (env.SOCIAL_LINKS ?? "")
    .split(",")
    .map((entry) => entry.split("|").map((s) => s.trim()))
    .filter(([label, href]) => label && href?.startsWith("https://"))
    .slice(0, 6)
    .map(([label, href]) => ({ label: label!.slice(0, 30), href: href! }));
}
