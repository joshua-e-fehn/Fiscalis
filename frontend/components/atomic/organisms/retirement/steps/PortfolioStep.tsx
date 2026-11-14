"use client";

import { Briefcase, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/shadcn/select";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import {
	useRetirementAmountsCurrency,
	useRetirementPreview,
} from "@/hooks/convex/retirement";
import {
	FUNDING_TREATMENT_LABELS,
	type FundingTreatment,
} from "@/lib/types/retirement";
import { formatCurrency, formatRate } from "@/lib/utils/currency";
import { RetirementStepShell } from "../shared/RetirementStepShell";
import type { RetirementStepProps } from "./types";

const TREATMENTS = Object.keys(FUNDING_TREATMENT_LABELS) as FundingTreatment[];

/**
 * The ids of FUNDING_CATEGORIES (services/finance/retirementService.ts), each
 * with a name under retirement.portfolioStep.categories.
 */
const CATEGORY_KEYS = [
	"equities",
	"real-estate",
	"crypto",
	"bonds",
	"commodities",
	"cash",
	"collectibles",
	"property",
] as const;
type CategoryKey = (typeof CATEGORY_KEYS)[number];

function isCategoryKey(id: string): id is CategoryKey {
	return (CATEGORY_KEYS as readonly string[]).includes(id);
}

function strong(chunks: ReactNode) {
	return <span className="font-medium text-foreground">{chunks}</span>;
}

export function PortfolioStep({
	data,
	update,
	onNext,
	onBack,
	isSaving,
	currency: inputsCurrency,
}: RetirementStepProps) {
	const t = useTranslations("retirement.portfolioStep");
	const tRetirement = useTranslations("retirement");
	const tFinance = useTranslations("common.finance");
	const currency = useRetirementAmountsCurrency(inputsCurrency);
	// The funding base exactly as the plan uses it (dashboard assets per
	// category, liabilities, the residence mortgage taken out).
	const results = useRetirementPreview(data, inputsCurrency);
	const loading = !results;
	const zero = formatCurrency(0, currency, { compact: true });
	// The service's English label is the fallback for an unknown category.
	const categoryName = (id: string, label: string) =>
		isCategoryKey(id) ? t(`categories.${id}`) : label;

	const setTreatment = (category: string, treatment: FundingTreatment) =>
		update({
			fundingTreatments: { ...data.fundingTreatments, [category]: treatment },
		});

	return (
		<RetirementStepShell
			icon={Briefcase}
			title={t("title")}
			description={t("description")}
			onNext={onNext}
			onBack={onBack}
			isSaving={isSaving}
		>
			{loading ? (
				<Skeleton className="h-48 w-full rounded-lg" />
			) : (
				<div className="space-y-3">
					{results.fundingLines.length === 0 && (
						<p className="text-sm text-muted-foreground">
							{t("noAssets", { zero })}
						</p>
					)}
					{results.fundingLines.map((line) => {
						const name = categoryName(line.category, line.label);
						return (
							<div
								key={line.category}
								className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
							>
								<div>
									<p className="text-sm font-medium">{name}</p>
									<p
										className={
											line.treatment === "exclude"
												? "text-xs text-muted-foreground line-through"
												: "text-xs text-muted-foreground"
										}
									>
										{formatCurrency(line.value, currency)}
									</p>
								</div>
								<Select
									value={line.treatment}
									onValueChange={(value: FundingTreatment) =>
										setTreatment(line.category, value)
									}
								>
									<SelectTrigger
										className="w-64"
										aria-label={t("growthLabel", { category: name })}
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{TREATMENTS.map((treatment) => (
											<SelectItem key={treatment} value={treatment}>
												{t(`treatments.${treatment}`)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						);
					})}

					{results.liabilitiesCounted > 0 && (
						<div className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
							<span>{tFinance("liabilities")}</span>
							<span className="font-medium">
								−{formatCurrency(results.liabilitiesCounted, currency)}
							</span>
						</div>
					)}

					<div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-4">
						<div>
							<p className="font-medium">{t("fundable")}</p>
							<p className="text-xs text-muted-foreground">
								{t("expectedGrowth", {
									expected: formatRate(results.optimistic.baseReturn),
									conservative: formatRate(results.conservative.baseReturn),
								})}
							</p>
						</div>
						<span className="text-xl font-bold">
							{formatCurrency(results.fundableNow, currency)}
						</span>
					</div>
				</div>
			)}

			{results?.hasNetDebt && (
				<Note>
					{t.rich("netDebt", {
						b: strong,
						debt: formatCurrency(-results.fundableNow, currency),
						zero,
					})}
				</Note>
			)}
			{results?.residenceMortgage && (
				<Note>
					{results.residenceMortgage.monthlyPayment > 0
						? t.rich("mortgageWithPayment", {
								b: strong,
								balance: formatCurrency(
									results.residenceMortgage.balance,
									currency,
								),
								payment: tRetirement("perMonth", {
									amount: formatCurrency(
										results.residenceMortgage.monthlyPayment,
										currency,
									),
								}),
							})
						: t.rich("mortgage", {
								b: strong,
								balance: formatCurrency(
									results.residenceMortgage.balance,
									currency,
								),
							})}
					{!results.residenceMortgage.balanceProjected && (
						<> {t("mortgageNotProjected")}</>
					)}
				</Note>
			)}

			<p className="text-xs text-muted-foreground">{t("footnote")}</p>
		</RetirementStepShell>
	);
}

function Note({ children }: { children: ReactNode }) {
	return (
		<div className="flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
			<Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
			<p>{children}</p>
		</div>
	);
}
