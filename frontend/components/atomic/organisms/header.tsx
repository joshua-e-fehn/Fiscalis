import { SignInButton, SignUpButton, SignedOut, SignedIn } from "@clerk/nextjs";
import { Separator } from "@/components/ui/shadcn/separator";
import { Button } from "@/components/ui/shadcn/button";
import { SidebarTrigger } from "@/components/ui/shadcn/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/shadcn/breadcrumb";
import Link from "next/link";

export function Header({
  hasSidebarTrigger,
  hasDashboardButton,
}: {
  hasSidebarTrigger: boolean;
  hasDashboardButton: boolean;
}) {
  return (
    <header className="sticky top-0 z-50 bg-background flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
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
