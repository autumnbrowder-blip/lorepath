import { PortalAuthLayout } from "@/components/auth/PortalAuthLayout";

export default function ResetPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PortalAuthLayout>{children}</PortalAuthLayout>;
}
