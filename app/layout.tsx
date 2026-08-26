import type { Metadata } from "next";
import { Cinzel, Cormorant_Garamond, Italianno } from "next/font/google";
import { AnalyticsProvider } from "@/components/AnalyticsProvider";
import { BackToTop } from "@/components/BackToTop";
import { Navbar } from "@/components/Navbar";
import { PageViewTracker } from "@/components/PageViewTracker";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ScrollParallax } from "@/components/theme/ScrollParallax";
import "./globals.css";

const italianno = Italianno({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-wordmark",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-heading",
});

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-label",
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
    <html
      lang="en"
      className={`dark ${italianno.variable} ${cormorant.variable} ${cinzel.variable}`}
      suppressHydrationWarning
    >
      <body
        className={`${italianno.variable} ${cormorant.variable} ${cinzel.variable} min-h-screen bg-background font-heading font-normal text-foreground antialiased selection:bg-accent/30`}
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
