import type { Metadata } from "next";
import { Inter, Noto_Sans_Devanagari, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({ variable: "--font-sans", subsets: ["latin"] });
const deva = Noto_Sans_Devanagari({ variable: "--font-deva", subsets: ["devanagari"], weight: ["400", "500", "600", "700"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Music Rights Cloud", template: "%s · Music Rights Cloud" },
  description: "Music copyright, ownership and evidence management for labels, studios and artists.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${deva.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full bg-background font-sans" style={{ fontFamily: "var(--font-sans), var(--font-deva), sans-serif" }}>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
