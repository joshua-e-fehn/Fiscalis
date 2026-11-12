"use client";

import { Home, Info } from "lucide-react";
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
} from "@/hooks/convex/retirement";
import { useBaseCurrency } from "@/hooks/convex/portfolio";
import { validateRetirementInputs } from "@/lib/types/retirement";
import { currencySymbols, formatCurrency } from "@/lib/utils/currency";
import { RetirementStepShell } from "../shared/RetirementStepShell";
import type { RetirementStepProps } from "./types";

/** Select value for "no residence mortgage linked". */
const NO_LOAN = "none";
/** Select value prefixes: a tracked loan or a bank (Plaid) mortgage account. */
const LOAN_PREFIX = "loan:";
const ACCOUNT_PREFIX = "account:";

export function HousingStep({
	data,
	update,
	onNext,
	onBack,
	isSaving,
}: RetirementStepProps) {
	const currency = useBaseCurrency();
	const errors = validateRetirementInputs(data);
	const equityError = errors.fundableRealEstateEquity;
	const mortgageError =
		errors.primaryResidenceMortgageRate ??
		errors.primaryResidenceMortgagePayment;
	const loans = useRetirementMortgageCandidates();
	const accounts = useRetirementMortgageAccounts();
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
			title="Your home"
			description="Property is handled differently from investments — let's get it right."
			onNext={onNext}
			onBack={onBack}
			nextDisabled={!!equityError || !!mortgageError}
			isSaving={isSaving}
		>
			<div className="flex items-center justify-between rounded-lg border border-border p-4">
				<div className="space-y-0.5 pr-4">
					<Label htmlFor="ownsHome">I own the home I live in</Label>
					<p className="text-xs text-muted-foreground">
						An owner-occupied home isn&apos;t counted as retirement funding.
					</p>
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
						We <span className="font-medium text-foreground">don&apos;t</span>{" "}
						count your home toward the portfolio that funds retirement — you
						can&apos;t sell it and still live in it. Its real benefit is already
						reflected in your lower monthly expenses (no rent).
					</p>
				</div>
			)}

			{data.ownsPrimaryResidence && (
				<div className="space-y-2">
					<Label htmlFor="residenceLoan">
						Mortgage on this home{" "}
						<span className="font-normal text-muted-foreground">(optional)</span>
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
							<SelectItem value={NO_LOAN}>No mortgage / not tracked</SelectItem>
							{!!loans?.length && (
								<SelectGroup>
									<SelectLabel>Tracked loans</SelectLabel>
									{loans.map((loan) => (
										<SelectItem
											key={loan._id}
											value={`${LOAN_PREFIX}${loan._id}`}
										>
											{loan.name} —{" "}
											{formatCurrency(loan.currentBalance, loan.currency)}
										</SelectItem>
									))}
								</SelectGroup>
							)}
							{!!accounts?.length && (
								<SelectGroup>
									<SelectLabel>Bank mortgage accounts</SelectLabel>
									{accounts.map((account) => (
										<SelectItem
											key={account._id}
											value={`${ACCOUNT_PREFIX}${account._id}`}
										>
											{account.name} —{" "}
											{formatCurrency(account.balance, currency)}
										</SelectItem>
									))}
								</SelectGroup>
							)}
						</SelectContent>
					</Select>
					<p className="text-xs text-muted-foreground">
						Its balance is not subtracted from your retirement funding: you pay
						the repayments from your income until retirement, like rent. Any
						balance still owed when you retire is added to your target.
					</p>
				</div>
			)}

			{data.ownsPrimaryResidence && linkedAccount && (
				<div className="space-y-3 rounded-lg border border-border p-4">
					<p className="text-sm text-muted-foreground">
						Your bank reports only the balance. Add the interest rate and
						monthly repayment to project what is still owed when you retire.
					</p>
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="mortgageRate">Interest rate (% a year)</Label>
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
								Monthly repayment ({currencySymbols[currency].trim()})
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
					{mortgageError ? (
						<p className="text-xs text-destructive">{mortgageError}.</p>
					) : (
						!hasTerms && (
							<p className="text-xs text-muted-foreground">
								Without both, the full current balance counts as still owed at
								retirement.
							</p>
						)
					)}
				</div>
			)}

			<div className="space-y-2">
				<Label htmlFor="fundableEquity">
					Sellable property equity to fund retirement{" "}
					<span className="font-normal text-muted-foreground">(optional)</span>
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
				{equityError ? (
					<p className="text-xs text-destructive">{equityError}.</p>
				) : (
					<p className="text-xs text-muted-foreground">
						For a rental or second property you plan to sell: its value minus
						any loan on it that isn&apos;t tracked in Fiscalis (tracked loans
						are already subtracted from your net worth). Leave at 0 if none.
					</p>
				)}
			</div>
		</RetirementStepShell>
	);
}
