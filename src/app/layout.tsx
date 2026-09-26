import type { Metadata, Viewport } from "next";
import Link from "next/link";
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
    { media: "(prefers-color-scheme: light)", color: "#eef2e2" },
    { media: "(prefers-color-scheme: dark)", color: "#16130f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Familjen+Grotesk:wght@500;700&family=JetBrains+Mono:wght@500;700&display=swap"
        />
      </head>
      <body>
        <div className="shell">
          <header className="topbar">
            <Link href="/" className="wordmark">
              <svg viewBox="0 0 26 26" aria-hidden="true">
                <circle cx="13" cy="13" r="11" fill="var(--leaf-soft)" />
                <path d="M13 13 L21 6" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="13" cy="13" r="3" fill="var(--ink)" />
                <circle cx="21" cy="6" r="2.5" fill="var(--spray)" />
              </svg>
              PestBlaster
            </Link>
          </header>
          <main>{children}</main>
        </div>
        <Nav />
      </body>
    </html>
  );
}
