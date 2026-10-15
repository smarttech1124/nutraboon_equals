import type { Metadata, Viewport } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import { GlobalAssistant } from "@/components/chat/GlobalAssistant";
import "./globals.css";

// The Nutraboom family type pairing (ADR-070): DM Sans for text, Playfair Display for headlines.
const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
  title: {
    default: "Nutraboom Equals — Learn, plan, and get help in your language",
    template: "%s — Nutraboom Equals",
  },
  description:
    "AI-powered nutrition for Nigeria: ask about foods, plan family meals within your budget, and find verified nutritionists, accessible hospitals and food products.",
  applicationName: "Nutraboom Equals",
  openGraph: {
    type: "website",
    siteName: "Nutraboom Equals",
    locale: "en_NG",
    images: [{ url: "/brand/logo-full.png", width: 650, height: 240, alt: "Nutraboom Equals" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fefae0" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1d22" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // suppressHydrationWarning: browser extensions (e.g. Grammarly's data-gr-*
  // attributes) edit <html> and <body> before React loads. It only ignores
  // attribute differences on these two elements, not on anything inside them.
  return (
    <html
      lang="en-NG"
      className={`${dmSans.variable} ${playfair.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col font-sans" suppressHydrationWarning>
        <GlobalAssistant>{children}</GlobalAssistant>
      </body>
    </html>
  );
}
