import { PortalAuthLayout } from "@/components/auth/PortalAuthLayout";

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PortalAuthLayout>{children}</PortalAuthLayout>;
}
