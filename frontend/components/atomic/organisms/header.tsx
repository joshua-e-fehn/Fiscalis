"use client";

import { AlertTriangle } from "lucide-react";
import { SignInButton, SignUpButton, SignedOut, SignedIn } from "@clerk/nextjs";
import { Separator } from "@/components/ui/shadcn/separator";
import { Button } from "@/components/ui/shadcn/button";
import { SidebarTrigger } from "@/components/ui/shadcn/sidebar";
import Link from "next/link";
import { SyncAllButton } from "@/components/atomic/atoms/syncAllButton";
import { Badge } from "@/components/ui/shadcn/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/shadcn/tooltip";
import { useDisplayCurrency } from "@/hooks/convex/displayCurrency";

/** The rate's UTC day (YYYY-MM-DD) as a date in the app's format. */
function formatRateDate(day: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

/**
 * Flags a degraded exchange rate behind the display-currency figures: a
 * stale market rate (older than a week) or the built-in fallback table.
 * Figures are converted anyway; this says how far to trust them. Renders
 * nothing for EUR, a live market rate or while loading.
 */
export function FxRateNotice() {
  const { code, source, rateDate, isLoading } = useDisplayCurrency();
  if (isLoading || (source !== "stale" && source !== "fallback")) return null;

  // Whole sentences, one per case, so they can be translated as units
  const label =
    source === "stale" && rateDate
      ? `Rates as of ${formatRateDate(rateDate)}`
      : "Approximate rate";
  const detail =
    source === "stale" && rateDate
      ? `Amounts in ${code} use the exchange rate of ${formatRateDate(rateDate)}, the latest available.`
      : `No current exchange rate for ${code} is available, so amounts use an approximate rate.`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400"
          >
            <AlertTriangle className="h-3 w-3" aria-hidden />
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{detail}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function Header({
  hasSidebarTrigger,
  hasDashboardButton,
}: {
  hasSidebarTrigger: boolean;
  hasDashboardButton: boolean;
}) {
  return (
    <header className="sticky top-0 z-50 bg-background flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
      <div className="flex w-full items-center gap-2 px-4">
        {hasSidebarTrigger && (
          <>
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
          </>
        )}

        {/* <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="#">
                Building Your Application
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>Data Fetching</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb> */}
        <div className="ml-auto flex items-center gap-2">
          <SignedIn>
            {/* Only for a stale or fallback display-currency rate */}
            <FxRateNotice />
            <SyncAllButton />
          </SignedIn>
          <SignedOut>
            <SignInButton>
              <Button variant="outline">Sign in</Button>
            </SignInButton>
            <SignUpButton>
              <Button>Sign Up</Button>
            </SignUpButton>
          </SignedOut>
          {hasDashboardButton && (
            <SignedIn>
              <Link key="dashboard" href="/dashboard" prefetch={true}>
                <Button variant="outline">Dashboard</Button>
              </Link>
            </SignedIn>
          )}
        </div>
      </div>
    </header>
  );
}
