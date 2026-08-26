import type { Metadata } from "next";
import { Cinzel_Decorative } from "next/font/google";
import { AnalyticsProvider } from "@/components/AnalyticsProvider";
import { BackToTop } from "@/components/BackToTop";
import { Navbar } from "@/components/Navbar";
import { PageViewTracker } from "@/components/PageViewTracker";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ScrollParallax } from "@/components/theme/ScrollParallax";
import "./globals.css";

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
    <html lang="en" className={`dark ${cinzelDecorative.variable}`} suppressHydrationWarning>
      <body
        className={`${cinzelDecorative.variable} min-h-screen bg-background font-storybook text-foreground antialiased selection:bg-accent/30`}
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
