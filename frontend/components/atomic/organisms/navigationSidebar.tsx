"use client";

import * as React from "react";
import {
  AudioWaveform,
  Banknote,
  Bitcoin,
  BookOpen,
  Building2,
  Calculator,
  ChartLine,
  ChartNoAxesCombined,
  Command,
  GalleryVerticalEnd,
  GemIcon,
  Globe2,
  House,
  Landmark,
  PieChart,
  PiggyBank,
  ReceiptText,
  Settings2,
  Star,
  CreditCard,
  ChartCandlestick,
  HandCoins,
} from "lucide-react";

import { NavigationDropdown } from "@/components/atomic/molecules/navigationDropdown";
import { NavigationUserMenu } from "@/components/atomic/molecules/navigationUserMenu";
import { NavigationTeamSwitcher } from "@/components/atomic/molecules/navigationTeamSwitcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/shadcn/sidebar";

// This is sample data.
const data = {
  teams: [
    {
      name: "Acme Inc",
      logo: GalleryVerticalEnd,
      plan: "Enterprise",
    },
    {
      name: "Acme Corp.",
      logo: AudioWaveform,
      plan: "Startup",
    },
    {
      name: "Evil Corp.",
      logo: Command,
      plan: "Free",
    },
  ],
  navigationPortfolio: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: House,
      isActive: true,
      items: [],
    },
    {
      title: "Investments",
      url: "#",
      icon: ChartCandlestick,
      isActive: true,
      items: [
        {
          title: "Equities",
          url: "/assets/equities",
          icon: ChartLine,
        },
        {
          title: "Commodities",
          url: "/assets/commodities",
          icon: GemIcon,
        },
        {
          title: "Bonds",
          url: "/assets/bonds",
          icon: ReceiptText,
        },
        {
          title: "Real Estate",
          url: "/assets/real-estate",
          icon: Building2,
        },
        {
          title: "Cash & Money Market",
          url: "/assets/cash",
          icon: Banknote,
        },
        {
          title: "Crypto",
          url: "/assets/crypto",
          icon: Bitcoin,
        },
        {
          title: "Collectibles",
          url: "/assets/collectibles",
          icon: Star,
        },
      ],
    },
    {
      title: "Liabilities",
      url: "#",
      icon: CreditCard,
      items: [
        {
          title: "Loans",
          url: "/liabilities/loans",
          icon: HandCoins,
        },
      ],
    },
    {
      title: "Investment Strategies",
      url: "#",
      icon: ChartNoAxesCombined,
      items: [
        {
          title: "Pies",
          url: "#",
          icon: PieChart,
        },
      ],
    },
  ],
  navigationIntegrations: [
    {
      title: "Banking",
      url: "/integrations/banking",
      icon: Landmark,
      isActive: true,
      items: [],
    },
    {
      title: "Brokers",
      url: "/integrations/brokers",
      icon: ChartCandlestick,
      isActive: true,
      items: [],
    },
    {
      title: "Crypto",
      url: "/integrations/crypto",
      icon: Bitcoin,
      isActive: true,
      items: [],
    },
  ],
  navigationTools: [
    {
      title: "Retirement Planner",
      url: "/retirement",
      icon: PiggyBank,
      isActive: true,
      items: [],
    },
    {
      title: "Interest Calculators",
      url: "/tools/calculators/interest",
      icon: Calculator,
      isActive: true,
      items: [],
    },
    {
      title: "Loan Calculators",
      url: "/tools/calculators/loan",
      icon: Calculator,
      isActive: true,
      items: [],
    },
    {
      title: "World Map",
      url: "/tools/world-map",
      icon: Globe2,
      isActive: true,
      items: [],
    },
  ],
  others: [
    {
      title: "Documentation",
      url: "#",
      icon: BookOpen,
      items: [
        {
          title: "Introduction",
          url: "#",
        },
        {
          title: "Get Started",
          url: "#",
        },
        {
          title: "Tutorials",
          url: "#",
        },
        {
          title: "Changelog",
          url: "#",
        },
      ],
    },
    {
      title: "Settings",
      url: "#",
      icon: Settings2,
      items: [
        {
          title: "General",
          url: "#",
        },
        {
          title: "Team",
          url: "#",
        },
        {
          title: "Billing",
          url: "#",
        },
        {
          title: "Limits",
          url: "#",
        },
      ],
    },
  ],
};

export function NavigationSidebar({
  user,
  ...props
}: {
  user: {
    name: string;
    email: string;
    avatar: string;
  };
} & React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <NavigationTeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavigationDropdown
          groupLabel="Portfolio"
          items={data.navigationPortfolio}
        />
        <NavigationDropdown groupLabel="Tools" items={data.navigationTools} />
        <NavigationDropdown
          groupLabel="Integrations"
          items={data.navigationIntegrations}
        />
        <NavigationDropdown groupLabel="Others" items={data.others} />
      </SidebarContent>
      <SidebarFooter>
        <NavigationUserMenu user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
