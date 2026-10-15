import Image from "next/image";
import logo from "@/public/brand/logo.png";
import logoLight from "@/public/brand/logo-light.png";

/**
 * The Nutraboom Equals logo in n-equals (ADR-070, ADR-080). Imported from
 * the main app's public/brand files, so both apps always show the same
 * artwork; the cream version is used in dark mode.
 */
export function AdminLogo({ className = "h-9 w-auto" }: { className?: string }) {
  return (
    <>
      <Image src={logo} alt="Nutraboom Equals" className={`${className} dark:hidden`} priority />
      <Image
        src={logoLight}
        alt="Nutraboom Equals"
        className={`${className} hidden dark:block`}
        priority
      />
    </>
  );
}
