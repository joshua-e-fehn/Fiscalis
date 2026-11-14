"use client";

import {
	Banknote,
	Bitcoin,
	BookOpen,
	Building2,
	Calculator,
	ChartCandlestick,
	ChartLine,
	ChartNoAxesCombined,
	CreditCard,
	GemIcon,
	Globe2,
	HandCoins,
	House,
	Landmark,
	LayoutGrid,
	PieChart,
	PiggyBank,
	ReceiptText,
	Settings2,
	Star,
	type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type * as React from "react";

import { NavigationDropdown } from "@/components/atomic/molecules/navigationDropdown";
import { NavigationBrand } from "@/components/atomic/molecules/navigationBrand";
import { NavigationUserMenu } from "@/components/atomic/molecules/navigationUserMenu";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarRail,
} from "@/components/ui/shadcn/sidebar";
import {
	FEATURES,
	filterMenuByFeature,
	type FeatureFlag,
} from "@/lib/config/features";

interface NavigationItem {
	title: string;
	url: string;
	icon?: LucideIcon;
	isActive?: boolean;
	/** Hidden unless this flag is on (planned, not built yet) */
	feature?: FeatureFlag;
	items?: {
		title: string;
		url: string;
		icon?: LucideIcon;
		feature?: FeatureFlag;
	}[];
}

const data: Record<
	"navigationPortfolio" | "navigationIntegrations" | "navigationTools" | "others",
	NavigationItem[]
> = {
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
			url: "/liabilities",
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
					feature: "pies",
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
			feature: "documentation",
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
			url: "/settings/general",
			icon: Settings2,
			items: [
				{
					title: "General",
					url: "/settings/general",
				},
				{
					title: "API Keys",
					url: "/settings/api-keys",
				},
				{
					title: "Team",
					url: "#",
					feature: "teamSettings",
				},
				{
					title: "Billing",
					url: "#",
					feature: "billing",
				},
				{
					title: "Limits",
					url: "#",
					feature: "usageLimits",
				},
			],
		},
	],
};

/**
 * Liabilities opens a group, so its own page gets an "Overview" entry (the
 * one label added here, hence translated).
 */
function withLiabilitiesOverview(
	items: NavigationItem[],
	overview: string,
): NavigationItem[] {
	return items.map((item) =>
		item.url === "/liabilities"
			? {
					...item,
					items: [
						{ title: overview, url: "/liabilities", icon: LayoutGrid },
						...(item.items ?? []),
					],
				}
			: item,
	);
}

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
	const t = useTranslations("navigation");
	const portfolio = withLiabilitiesOverview(
		data.navigationPortfolio,
		t("liabilitiesOverview"),
	);
	return (
		<Sidebar collapsible="icon" {...props}>
			<SidebarHeader>
				<NavigationBrand />
			</SidebarHeader>
			<SidebarContent>
				<NavigationDropdown
					groupLabel="Portfolio"
					items={filterMenuByFeature(portfolio, FEATURES)}
				/>
				<NavigationDropdown groupLabel="Tools" items={filterMenuByFeature(data.navigationTools, FEATURES)} />
				<NavigationDropdown
					groupLabel="Integrations"
					items={filterMenuByFeature(data.navigationIntegrations, FEATURES)}
				/>
				<NavigationDropdown groupLabel="Others" items={filterMenuByFeature(data.others, FEATURES)} />
			</SidebarContent>
			<SidebarFooter>
				<NavigationUserMenu user={user} />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
