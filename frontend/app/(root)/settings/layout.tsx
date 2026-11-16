/**
 * Settings pages sit in the same centered, padded page container as the
 * other app pages (dashboard, liabilities, assets: `container mx-auto py-6`,
 * see app/(root)/dashboard/page.tsx and app/(root)/assets/crypto/layout.tsx).
 * Without it the settings cards ran flush against the sidebar edge.
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="container mx-auto py-6">{children}</div>;
}
