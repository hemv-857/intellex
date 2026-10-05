import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Intellex — AI Data Intelligence Platform",
  description:
    "Turn natural-language business requests into clean, structured, source-backed datasets. Describe what you need, and the AI designs and executes the collection workflow.",
  keywords: [
    "AI data platform",
    "data intelligence",
    "web scraping",
    "data collection",
    "workflow automation",
    "dataset",
  ],
  authors: [{ name: "Intellex" }],
  icons: {
    // Local asset, not a hotlink: the previous icon was served from the removed
    // provider's CDN, which meant every page load called out to their infra.
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Intellex — AI Data Intelligence Platform",
    description:
      "Prompt-based data intelligence. Describe what you need in plain English; the AI designs and runs the collection workflow.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
          <SonnerToaster position="top-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
