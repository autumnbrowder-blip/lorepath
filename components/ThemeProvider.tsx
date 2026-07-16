"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/** LorePath is permanently locked to dark (forest + antique gold). */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      forcedTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
