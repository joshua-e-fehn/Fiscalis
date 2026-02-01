import { SidebarInset, SidebarProvider } from "@/components/ui/shadcn/sidebar";

import QueryProvider from "@/providers/queryProvider";
import { SyncProvider } from "@/providers/syncProvider";

import { NavigationSidebarWrapper } from "@/components/atomic/organisms/navigationSidebarWrapper";
import { Header } from "@/components/atomic/organisms/header";

import { Protect } from "@clerk/nextjs";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <Protect>
      <main>
        <QueryProvider>
          <SyncProvider>
            <SidebarProvider>
              <NavigationSidebarWrapper />
              <SidebarInset>
                <Header hasSidebarTrigger={true} hasDashboardButton={false} />
                {children}
              </SidebarInset>
            </SidebarProvider>
          </SyncProvider>
        </QueryProvider>
      </main>
    </Protect>
  );
}
