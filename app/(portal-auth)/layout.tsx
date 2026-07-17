import { PortalAuthLayout } from "@/components/auth/PortalAuthLayout";

/**
 * Shared layout for Login / Register (and related auth forms).
 * One PortalAuthLayout instance persists across these routes so the portal
 * scene does not remount or visually jump when switching pages.
 */
export default function PortalAuthRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PortalAuthLayout>{children}</PortalAuthLayout>;
}
