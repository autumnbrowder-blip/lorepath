import type { Metadata } from "next";
import { Cinzel, Cinzel_Decorative, Cormorant_Garamond, Inter } from "next/font/google";
import { AnalyticsProvider } from "@/components/AnalyticsProvider";
import { BackToTop } from "@/components/BackToTop";
import { Navbar } from "@/components/Navbar";
import { PageViewTracker } from "@/components/PageViewTracker";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ScrollParallax } from "@/components/theme/ScrollParallax";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-heading",
});

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
});

const cinzelDecorative = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-storybook",
});

export const metadata: Metadata = {
  title: "LorePath",
  description: "Know before you turn the page",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${cormorant.variable} ${cinzel.variable} ${cinzelDecorative.variable} min-h-screen bg-background font-sans text-foreground antialiased selection:bg-accent/30`}
      >
        <ThemeProvider>
          <AnalyticsProvider>
            <PageViewTracker />
            <div className="flex min-h-dvh min-h-screen flex-col overflow-x-clip">
              <Navbar />
              <main className="relative flex min-h-0 w-full max-w-full flex-1 flex-col">
                {children}
              </main>
            </div>
            <BackToTop />
            <ScrollParallax />
          </AnalyticsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
