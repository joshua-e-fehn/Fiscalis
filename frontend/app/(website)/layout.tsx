import { Header } from "@/components/atomic/organisms/header";

export default function WebsiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main>
      <Header hasSidebarTrigger={false} hasDashboardButton={true} />
      {children}
    </main>
  );
}
