import Image from "next/image";

/**
 * The Equals logo (ADR-070). Green-on-transparent for light pages; a cream
 * version for dark mode and deep-teal panels. Both are transparent PNGs made
 * from the supplied artwork (public/brand).
 */
export function BrandLogo({
  variant = "header",
  tone = "auto",
  className = "h-10 w-auto",
  priority = false,
}: {
  /** "header": mark and name. "full": with the "AI-powered nutrition" line. */
  variant?: "header" | "full";
  /** "auto" follows the colour scheme; "light" is the cream logo for dark panels. */
  tone?: "auto" | "light";
  className?: string;
  priority?: boolean;
}) {
  const [w, h] = variant === "full" ? [650, 240] : [510, 160];
  const base = variant === "full" ? "/brand/logo-full" : "/brand/logo";
  const alt = "Nutraboom Equals";
  if (tone === "light") {
    return (
      <Image
        src={`${base}-light.png`}
        alt={alt}
        width={w}
        height={h}
        className={className}
        priority={priority}
      />
    );
  }
  return (
    <>
      <Image
        src={`${base}.png`}
        alt={alt}
        width={w}
        height={h}
        className={`${className} dark:hidden`}
        priority={priority}
      />
      <Image
        src={`${base}-light.png`}
        alt={alt}
        width={w}
        height={h}
        className={`${className} hidden dark:block`}
        priority={priority}
      />
    </>
  );
}
