import { SignInButton, SignedOut, SignedIn } from "@clerk/nextjs";
import { Separator } from "@/components/ui/shadcn/separator";
import { Button } from "@/components/ui/shadcn/button";
import { SidebarTrigger } from "@/components/ui/shadcn/sidebar";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { SyncAllButton } from "@/components/atomic/atoms/syncAllButton";
import { FxRateNotice } from "@/components/atomic/atoms/fxRateNotice";
import { NotificationBell } from "@/components/atomic/atoms/notificationBell";

export function Header({
  hasSidebarTrigger,
  hasDashboardButton,
}: {
  hasSidebarTrigger: boolean;
  hasDashboardButton: boolean;
}) {
  const t = useTranslations("navigation.header");
  return (
    <header className="sticky top-0 z-50 bg-background flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
      <div className="flex w-full items-center gap-2 px-4">
        {hasSidebarTrigger && (
          <>
            <SidebarTrigger className="-ms-1" />
            <Separator orientation="vertical" className="me-2 h-4" />
          </>
        )}

        <div className="ms-auto flex items-center gap-2">
          <SignedIn>
            {/* Only for a stale or fallback display-currency rate */}
            <FxRateNotice />
            <SyncAllButton />
            <NotificationBell />
          </SignedIn>
          <SignedOut>
            <SignInButton>
              <Button variant="outline">{t("signIn")}</Button>
            </SignInButton>
            {/* Sign-up is waitlist-only (ENG-226) */}
            <Link href="/waitlist">
              <Button>{t("joinWaitlist")}</Button>
            </Link>
          </SignedOut>
          {hasDashboardButton && (
            <SignedIn>
              <Link key="dashboard" href="/dashboard" prefetch={true}>
                <Button variant="outline">{t("dashboard")}</Button>
              </Link>
            </SignedIn>
          )}
        </div>
      </div>
    </header>
  );
}
