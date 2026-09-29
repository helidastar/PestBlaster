import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { LiveChip } from "@/components/LiveChip";
import { Logo } from "@/components/Logo";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "PestBlaster",
  description: "Watch and control the PestBlaster lettuce pest turret.",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e9efdd" },
    { media: "(prefers-color-scheme: dark)", color: "#101a12" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Browser extensions (e.g. QuillBot) add attributes to <html> before React loads.
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=Gabarito:wght@600;700;800&family=JetBrains+Mono:wght@500;700&display=swap"
        />
      </head>
      <body>
        <div className="shell">
          <header className="topbar">
            <Link href="/" className="wordmark">
              <Logo />
              PestBlaster
            </Link>
            {/* one nav: fixed tab bar at the bottom on phones, inline in this header on wide screens */}
            <Nav />
            <LiveChip />
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
