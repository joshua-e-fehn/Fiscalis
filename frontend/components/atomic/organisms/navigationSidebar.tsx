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
import type { Messages } from "@/i18n/messages";

/** A sidebar label: a key under navigation.sidebar.items */
type NavigationItemKey = keyof Messages["navigation"]["sidebar"]["items"];

interface NavigationSubItem {
	titleKey: NavigationItemKey;
	url: string;
	icon?: LucideIcon;
	feature?: FeatureFlag;
}

interface NavigationItem {
	titleKey: NavigationItemKey;
	url: string;
	icon?: LucideIcon;
	isActive?: boolean;
	/** Hidden unless this flag is on (planned, not built yet) */
	feature?: FeatureFlag;
	items?: NavigationSubItem[];
}

const data: Record<
	"navigationPortfolio" | "navigationIntegrations" | "navigationTools" | "others",
	NavigationItem[]
> = {
	navigationPortfolio: [
		{
			titleKey: "dashboard",
			url: "/dashboard",
			icon: House,
			isActive: true,
			items: [],
		},
		{
			titleKey: "investments",
			url: "#",
			icon: ChartCandlestick,
			isActive: true,
			items: [
				{
					titleKey: "equities",
					url: "/assets/equities",
					icon: ChartLine,
				},
				{
					titleKey: "commodities",
					url: "/assets/commodities",
					icon: GemIcon,
				},
				{
					titleKey: "bonds",
					url: "/assets/bonds",
					icon: ReceiptText,
				},
				{
					titleKey: "realEstate",
					url: "/assets/real-estate",
					icon: Building2,
				},
				{
					titleKey: "cash",
					url: "/assets/cash",
					icon: Banknote,
				},
				{
					titleKey: "crypto",
					url: "/assets/crypto",
					icon: Bitcoin,
				},
				{
					titleKey: "collectibles",
					url: "/assets/collectibles",
					icon: Star,
				},
			],
		},
		{
			titleKey: "liabilities",
			url: "/liabilities",
			icon: CreditCard,
			items: [
				{
					titleKey: "loans",
					url: "/liabilities/loans",
					icon: HandCoins,
				},
			],
		},
		{
			titleKey: "investmentStrategies",
			url: "/strategies/pies",
			icon: ChartNoAxesCombined,
			items: [
				{
					titleKey: "pies",
					url: "/strategies/pies",
					icon: PieChart,
				},
			],
		},
	],
	navigationIntegrations: [
		{
			titleKey: "banking",
			url: "/integrations/banking",
			icon: Landmark,
			isActive: true,
			items: [],
		},
		{
			titleKey: "brokers",
			url: "/integrations/brokers",
			icon: ChartCandlestick,
			isActive: true,
			items: [],
		},
	],
	navigationTools: [
		{
			titleKey: "retirementPlanner",
			url: "/retirement",
			icon: PiggyBank,
			isActive: true,
			items: [],
		},
		{
			titleKey: "interestCalculators",
			url: "/tools/calculators/interest",
			icon: Calculator,
			isActive: true,
			items: [],
		},
		{
			titleKey: "loanCalculators",
			url: "/tools/calculators/loan",
			icon: Calculator,
			isActive: true,
			items: [],
		},
		{
			titleKey: "worldMap",
			url: "/tools/world-map",
			icon: Globe2,
			isActive: true,
			items: [],
		},
	],
	others: [
		{
			titleKey: "documentation",
			url: "#",
			icon: BookOpen,
			feature: "documentation",
			items: [
				{
					titleKey: "introduction",
					url: "#",
				},
				{
					titleKey: "getStarted",
					url: "#",
				},
				{
					titleKey: "tutorials",
					url: "#",
				},
				{
					titleKey: "changelog",
					url: "#",
				},
			],
		},
		{
			titleKey: "settings",
			url: "/settings/general",
			icon: Settings2,
			items: [
				{
					titleKey: "general",
					url: "/settings/general",
				},
				{
					titleKey: "apiKeys",
					url: "/settings/api-keys",
				},
				{
					titleKey: "categories",
					url: "/settings/categories",
				},
				{
					titleKey: "privacy",
					url: "/settings/privacy",
				},
				{
					titleKey: "team",
					url: "#",
					feature: "teamSettings",
				},
				{
					titleKey: "billing",
					url: "#",
					feature: "billing",
				},
				{
					titleKey: "limits",
					url: "#",
					feature: "usageLimits",
				},
			],
		},
	],
};

/** Liabilities opens a group, so its own page gets an "Overview" entry. */
function withLiabilitiesOverview(items: NavigationItem[]): NavigationItem[] {
	return items.map((item) =>
		item.url === "/liabilities"
			? {
					...item,
					items: [
						{
							titleKey: "liabilitiesOverview",
							url: "/liabilities",
							icon: LayoutGrid,
						},
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
	const t = useTranslations("navigation.sidebar");

	/** Drops entries behind an off feature flag, then labels the rest. */
	const menu = (items: NavigationItem[]) =>
		filterMenuByFeature(items, FEATURES).map(({ titleKey, items: sub, ...item }) => ({
			...item,
			title: t(`items.${titleKey}`),
			items: sub?.map(({ titleKey: subKey, ...subItem }) => ({
				...subItem,
				title: t(`items.${subKey}`),
			})),
		}));

	return (
		<Sidebar collapsible="icon" {...props}>
			<SidebarHeader>
				<NavigationBrand />
			</SidebarHeader>
			<SidebarContent>
				<NavigationDropdown
					groupLabel={t("groups.portfolio")}
					items={menu(withLiabilitiesOverview(data.navigationPortfolio))}
				/>
				<NavigationDropdown
					groupLabel={t("groups.tools")}
					items={menu(data.navigationTools)}
				/>
				<NavigationDropdown
					groupLabel={t("groups.integrations")}
					items={menu(data.navigationIntegrations)}
				/>
				<NavigationDropdown
					groupLabel={t("groups.others")}
					items={menu(data.others)}
				/>
			</SidebarContent>
			<SidebarFooter>
				<NavigationUserMenu user={user} />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
