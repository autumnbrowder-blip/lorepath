"use client";

import { AuthNav } from "@/components/AuthNav";
import Image from "next/image";
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
      <nav className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-2.5 sm:gap-3 sm:px-6 sm:py-3">
        <Link
          href="/"
          aria-label="LorePath home"
          className="shrink-0 transition-opacity hover:opacity-90"
        >
          <Image
            src="/images/lorepath-nav-logo.png"
            alt="LorePath"
            width={324}
            height={298}
            priority
            className="h-10 w-auto sm:h-[52px]"
          />
        </Link>

        <div className="flex min-w-0 items-center gap-2 sm:gap-5">
          <ul className="flex items-center gap-2.5 sm:gap-6">
            {navLinks.map((link) => (
              <li key={link.href}>
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
          <AuthNav />
        </div>
      </nav>
    </header>
  );
}
