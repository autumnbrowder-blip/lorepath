"use client";

import { AuthNav } from "@/components/AuthNav";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/browse", label: "Browse" },
  { href: "/faq", label: "FAQ" },
];

const navLinkClass =
  "site-nav-gold inline-flex min-h-[2.5rem] items-center px-0.5 sm:min-h-0";

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-gold-600/30 bg-forest-950/95 shadow-[0_4px_24px_rgba(0,0,0,0.35)] backdrop-blur-md">
      <nav className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-1.5 sm:px-6 sm:py-2">
        <Link
          href="/"
          aria-label="LorePath home"
          className="site-nav-wordmark justify-self-start"
        >
          LorePath
        </Link>

        <ul className="flex items-center gap-1.5 sm:gap-2.5">
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

        <div className="justify-self-end">
          <AuthNav />
        </div>
      </nav>
    </header>
  );
}
