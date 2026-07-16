import { PortalAuthLayout } from "@/components/auth/PortalAuthLayout";

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PortalAuthLayout>{children}</PortalAuthLayout>;
}
