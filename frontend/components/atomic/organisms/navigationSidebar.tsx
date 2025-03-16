"use client";

import * as React from "react";
import {
  AudioWaveform,
  BookOpen,
  Bot,
  Command,
  Frame,
  GalleryVerticalEnd,
  Map,
  PieChart,
  Settings2,
  SquareTerminal,
} from "lucide-react";

import { NavigationPortfolio } from "@/components/atomic/molecules/navigationPortfolio";
import { NavigationProjects } from "@/components/atomic/molecules/navigationProjects";
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
  user: {
    name: "shadcn",
    email: "m@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
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
      url: "#",
      icon: SquareTerminal,
      isActive: true,
      items: [],
    },
    {
      title: "Investment Categories",
      url: "#",
      icon: SquareTerminal,
      isActive: true,
      items: [
        {
          title: "Aktien",
          url: "#",
        },
        {
          title: "Rohstoffe",
          url: "/rohstoffe",
        },
        {
          title: "Anleihen",
          url: "#",
        },
        {
          title: "Immobilien",
          url: "#",
        },
        {
          title: "Geldmarkt",
          url: "#",
        },
        {
          title: "Kryptowährungen",
          url: "#",
        },
        {
          title: "Sammelstücke",
          url: "#",
        },
      ],
    },
    {
      title: "Investment Strategies",
      url: "#",
      icon: Bot,
      items: [
        {
          title: "Genesis",
          url: "#",
        },
        {
          title: "Explorer",
          url: "#",
        },
        {
          title: "Quantum",
          url: "#",
        },
      ],
    },
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
  projects: [
    {
      name: "Design Engineering",
      url: "#",
      icon: Frame,
    },
    {
      name: "Sales & Marketing",
      url: "#",
      icon: PieChart,
    },
    {
      name: "Travel",
      url: "#",
      icon: Map,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <NavigationTeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavigationPortfolio items={data.navigationPortfolio} />
        <NavigationProjects projects={data.projects} />
      </SidebarContent>
      <SidebarFooter>
        <NavigationUserMenu user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
