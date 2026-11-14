"use client";

import { Home, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/shadcn/select";
import { Switch } from "@/components/ui/shadcn/switch";
import {
	useRetirementMortgageAccounts,
	useRetirementMortgageCandidates,
	useRetirementAmountsCurrency,
} from "@/hooks/convex/retirement";
import { retirementInputIssues } from "@/lib/types/retirement";
import { currencySymbols, formatCurrency } from "@/lib/utils/currency";
import { RetirementStepShell } from "../shared/RetirementStepShell";
import { useRetirementIssueMessage } from "../shared/useRetirementIssueMessage";
import type { RetirementStepProps } from "./types";

/** Select value for "no residence mortgage linked". */
const NO_LOAN = "none";
/** Select value prefixes: a tracked loan or a bank (Plaid) mortgage account. */
const LOAN_PREFIX = "loan:";
const ACCOUNT_PREFIX = "account:";

/** The "(optional)" suffix of a label (the <muted> tag of its messages). */
function muted(chunks: ReactNode) {
	return <span className="font-normal text-muted-foreground">{chunks}</span>;
}

function strong(chunks: ReactNode) {
	return <span className="font-medium text-foreground">{chunks}</span>;
}

export function HousingStep({
	data,
	update,
	onNext,
	onBack,
	isSaving,
	currency: inputsCurrency,
}: RetirementStepProps) {
	const t = useTranslations("retirement.housingStep");
	const issueMessage = useRetirementIssueMessage();
	const currency = useRetirementAmountsCurrency(inputsCurrency);
	const issues = retirementInputIssues(data);
	const equityIssue = issues.fundableRealEstateEquity;
	const mortgageIssue =
		issues.primaryResidenceMortgageRate ??
		issues.primaryResidenceMortgagePayment;
	const loans = useRetirementMortgageCandidates();
	const accounts = useRetirementMortgageAccounts(inputsCurrency);
	const linkedAccount = data.primaryResidenceAccountId;
	const selected = data.primaryResidenceLoanId
		? `${LOAN_PREFIX}${data.primaryResidenceLoanId}`
		: linkedAccount
			? `${ACCOUNT_PREFIX}${linkedAccount}`
			: NO_LOAN;
	const hasTerms =
		data.primaryResidenceMortgageRate !== undefined &&
		(data.primaryResidenceMortgagePayment ?? 0) > 0;

	return (
		<RetirementStepShell
			icon={Home}
			title={t("title")}
			description={t("description")}
			onNext={onNext}
			onBack={onBack}
			nextDisabled={!!equityIssue || !!mortgageIssue}
			isSaving={isSaving}
		>
			<div className="flex items-center justify-between rounded-lg border border-border p-4">
				<div className="space-y-0.5 pr-4">
					<Label htmlFor="ownsHome">{t("ownsHome")}</Label>
					<p className="text-xs text-muted-foreground">{t("ownsHomeHint")}</p>
				</div>
				<Switch
					id="ownsHome"
					checked={data.ownsPrimaryResidence}
					onCheckedChange={(checked) =>
						update({ ownsPrimaryResidence: checked })
					}
				/>
			</div>

			{data.ownsPrimaryResidence && (
				<div className="flex items-start gap-2 rounded-lg bg-primary/5 p-4 text-sm">
					<Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
					<p className="text-muted-foreground">
						{t.rich("homeNotCounted", { b: strong })}
					</p>
				</div>
			)}

			{data.ownsPrimaryResidence && (
				<div className="space-y-2">
					<Label htmlFor="residenceLoan">
						{t.rich("mortgageLabel", { muted })}
					</Label>
					<Select
						value={selected}
						onValueChange={(value) =>
							update({
								primaryResidenceLoanId: value.startsWith(LOAN_PREFIX)
									? value.slice(LOAN_PREFIX.length)
									: undefined,
								primaryResidenceAccountId: value.startsWith(ACCOUNT_PREFIX)
									? value.slice(ACCOUNT_PREFIX.length)
									: undefined,
								// The rate and repayment belong to the linked account
								...(value === selected
									? {}
									: {
											primaryResidenceMortgageRate: undefined,
											primaryResidenceMortgagePayment: undefined,
										}),
							})
						}
					>
						<SelectTrigger id="residenceLoan">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={NO_LOAN}>{t("noMortgage")}</SelectItem>
							{!!loans?.length && (
								<SelectGroup>
									<SelectLabel>{t("trackedLoans")}</SelectLabel>
									{loans.map((loan) => (
										<SelectItem
											key={loan._id}
											value={`${LOAN_PREFIX}${loan._id}`}
										>
											{t("mortgageOption", {
												name: loan.name,
												balance: formatCurrency(
													loan.currentBalance,
													loan.currency,
												),
											})}
										</SelectItem>
									))}
								</SelectGroup>
							)}
							{!!accounts?.length && (
								<SelectGroup>
									<SelectLabel>{t("bankMortgages")}</SelectLabel>
									{accounts.map((account) => (
										<SelectItem
											key={account._id}
											value={`${ACCOUNT_PREFIX}${account._id}`}
										>
											{t("mortgageOption", {
												name: account.name,
												balance: formatCurrency(account.balance, currency),
											})}
										</SelectItem>
									))}
								</SelectGroup>
							)}
						</SelectContent>
					</Select>
					<p className="text-xs text-muted-foreground">{t("mortgageHint")}</p>
				</div>
			)}

			{data.ownsPrimaryResidence && linkedAccount && (
				<div className="space-y-3 rounded-lg border border-border p-4">
					<p className="text-sm text-muted-foreground">
						{t("bankBalanceOnly")}
					</p>
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="mortgageRate">{t("interestRate")}</Label>
							<Input
								id="mortgageRate"
								type="number"
								min={0}
								step={0.1}
								value={
									data.primaryResidenceMortgageRate === undefined
										? ""
										: Math.round(data.primaryResidenceMortgageRate * 10000) /
											100
								}
								onChange={(e) =>
									update({
										primaryResidenceMortgageRate:
											e.target.value === ""
												? undefined
												: Number(e.target.value) / 100,
									})
								}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="mortgagePayment">
								{t("monthlyRepayment", {
									symbol: currencySymbols[currency].trim(),
								})}
							</Label>
							<Input
								id="mortgagePayment"
								type="number"
								min={0}
								step={50}
								value={data.primaryResidenceMortgagePayment ?? ""}
								onChange={(e) =>
									update({
										primaryResidenceMortgagePayment:
											e.target.value === ""
												? undefined
												: Number(e.target.value),
									})
								}
							/>
						</div>
					</div>
					{mortgageIssue ? (
						<p className="text-xs text-destructive">
							{issueMessage(mortgageIssue)}.
						</p>
					) : (
						!hasTerms && (
							<p className="text-xs text-muted-foreground">
								{t("withoutTerms")}
							</p>
						)
					)}
				</div>
			)}

			<div className="space-y-2">
				<Label htmlFor="fundableEquity">
					{t.rich("equityLabel", { muted })}
				</Label>
				<div className="relative">
					<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
						{currencySymbols[currency].trim()}
					</span>
					<Input
						id="fundableEquity"
						type="number"
						min={0}
						step={1000}
						className="pl-7"
						value={data.fundableRealEstateEquity || ""}
						onChange={(e) =>
							update({
								fundableRealEstateEquity: Number(e.target.value) || 0,
							})
						}
					/>
				</div>
				{equityIssue ? (
					<p className="text-xs text-destructive">
						{issueMessage(equityIssue)}.
					</p>
				) : (
					<p className="text-xs text-muted-foreground">{t("equityHint")}</p>
				)}
			</div>
		</RetirementStepShell>
	);
}
