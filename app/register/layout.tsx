import { PortalAuthLayout } from "@/components/auth/PortalAuthLayout";

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PortalAuthLayout>{children}</PortalAuthLayout>;
}
