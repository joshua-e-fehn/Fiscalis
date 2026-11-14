"use client";

import { CheckCircle2, Pencil, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PageHeader } from "@/components/atomic/molecules/investments";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/shadcn/alert-dialog";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import {
	useResetRetirementPlan,
	useRetirementPlan,
	useRetirementResults,
} from "@/hooks/convex/retirement";
import { RetirementResultsView } from "./RetirementResultsView";

interface RetirementDashboardProps {
	onEdit: () => void;
}

/**
 * "Start over": deletes the stored plan after a confirmation. The plan query
 * then reports no plan, so RetirementFlow swaps this dashboard for a fresh
 * wizard at its intro (and the dashboard teaser shows its no-plan state).
 */
function StartOverButton() {
	const resetPlan = useResetRetirementPlan();
	const t = useTranslations("retirement.dashboard.startOver");
	const tActions = useTranslations("common.actions");
	const [open, setOpen] = useState(false);
	const [isResetting, setIsResetting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const confirm = async () => {
		setError(null);
		setIsResetting(true);
		try {
			await resetPlan();
			setOpen(false);
		} catch (err) {
			console.error("Failed to reset retirement plan:", err);
			setError(t("failed"));
		} finally {
			setIsResetting(false);
		}
	};

	return (
		<AlertDialog
			open={open}
			onOpenChange={(next) => {
				if (isResetting) return;
				setOpen(next);
				if (!next) setError(null);
			}}
		>
			<AlertDialogTrigger asChild>
				<Button variant="ghost">
					<RotateCcw className="h-4 w-4" />
					{t("button")}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{t("title")}</AlertDialogTitle>
					<AlertDialogDescription>{t("description")}</AlertDialogDescription>
				</AlertDialogHeader>
				{error && (
					<p role="alert" className="text-sm text-destructive">
						{error}
					</p>
				)}
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isResetting}>
						{tActions("cancel")}
					</AlertDialogCancel>
					<AlertDialogAction
						onClick={(e) => {
							// Keep the dialog open until the reset settles
							e.preventDefault();
							void confirm();
						}}
						disabled={isResetting}
						className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
					>
						{isResetting ? t("resetting") : t("confirm")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

/**
 * The saved-plan view shown when the user has an active plan. No wizard stepper
 * and no "save" button — just the live results plus "Edit plan" and
 * "Start over" actions.
 */
export function RetirementDashboard({ onEdit }: RetirementDashboardProps) {
	const plan = useRetirementPlan();
	const results = useRetirementResults();
	const t = useTranslations("retirement.dashboard");
	const tActions = useTranslations("common.actions");

	const subtitle = plan
		? t("subtitle", { age: plan.retirementAge })
		: t("subtitleFallback");

	return (
		<div className="space-y-6 pb-12">
			<PageHeader
				title={t("title")}
				subtitle={subtitle}
				customActions={
					<div className="flex flex-wrap items-center gap-2">
						<Badge
							variant="outline"
							className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
						>
							<CheckCircle2 className="h-3.5 w-3.5" />
							{tActions("saved")}
						</Badge>
						<StartOverButton />
						<Button variant="outline" onClick={onEdit}>
							<Pencil className="h-4 w-4" />
							{t("editPlan")}
						</Button>
					</div>
				}
			/>

			<RetirementResultsView
				results={results}
				assumptions={plan ?? undefined}
				onEdit={onEdit}
				currency={results?.currency}
			/>
		</div>
	);
}
