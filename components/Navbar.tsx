"use client";

import { AuthNav } from "@/components/AuthNav";
import { Menu, X } from "lucide-react";
import { Cinzel_Decorative } from "next/font/google";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import "./Navbar.css";

const wordmark = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-logo",
});

const navLinks = [
  { href: "/browse", label: "Browse" },
  { href: "/faq", label: "FAQ" },
];

const navLinkClass =
  "site-nav-gold inline-flex min-h-11 items-center px-0.5 sm:min-h-0";

export function Navbar() {
  const pathname = usePathname();
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <header className="site-nav-header sticky top-0 z-50 border-b border-gold-600/30 bg-forest-950/95 shadow-[0_4px_24px_rgba(0,0,0,0.35)] backdrop-blur-md">
      <nav className="site-nav-bar grid w-full grid-cols-[1fr_auto_auto] items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <Link
          href="/"
          aria-label="LorePath home"
          className={`${wordmark.className} ${wordmark.variable} site-nav-wordmark cursor-pointer justify-self-start`}
        >
          LorePath
        </Link>

        <ul className="site-nav-links hidden items-center gap-1.5 sm:flex sm:gap-2.5">
          {navLinks.map((link, index) => (
            <li key={link.href} className="flex items-center gap-1.5 sm:gap-2.5">
              {index > 0 ? (
                <span
                  className="site-nav-gold select-none opacity-70"
                  aria-hidden="true"
                >
                  ·
                </span>
              ) : null}
              <Link
                href={link.href}
                className={`${navLinkClass} ${
                  pathname === link.href ? "site-nav-gold--active" : ""
                }`}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-self-end gap-1 sm:contents">
          <button
            type="button"
            className="site-nav-menu-btn sm:hidden"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
          <div className="justify-self-end">
            <AuthNav />
          </div>
        </div>
      </nav>

      {menuOpen ? (
        <ul id={menuId} className="site-nav-drawer sm:hidden">
          {navLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`site-nav-drawer-link ${
                  pathname === link.href ? "site-nav-gold--active" : ""
                }`}
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </header>
  );
}
