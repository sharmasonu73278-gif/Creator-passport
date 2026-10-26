import "./globals.css";
import Link from "next/link";
import type { Metadata, Viewport } from "next";
import Header from "@/components/Header";
import PwaRegister from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: {
    default: "Creator Resource Passport",
    template: "%s · Resource Passport",
  },
  description:
    "Find, open and save every resource a creator mentions in their reels and videos, all in one place.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f6b5c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main className="container">{children}</main>
        <footer className="site-footer">
          <div className="container">
            <p>
              Link clicks and saves shown to creators are measured on this site only. They are not Instagram
              metrics.
            </p>
            <p>
              <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> ·{" "}
              <Link href="/leaderboard">Top creators</Link>
            </p>
          </div>
        </footer>
        <PwaRegister />
      </body>
    </html>
  );
}
