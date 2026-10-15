import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "n-equals", template: "%s · n-equals" },
  description: "Nutraboom Equals administration portal.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// The admin portal uses the system UI font: no web-font download, and builds
// do not depend on reaching Google Fonts.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG" className="h-full antialiased" suppressHydrationWarning>
      <body className="flex min-h-full flex-col font-sans" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
