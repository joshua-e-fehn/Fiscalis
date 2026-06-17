"use client";

import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/shadcn/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/shadcn/card";
import { cn } from "@/lib/utils";

interface RetirementStepShellProps {
	icon: LucideIcon;
	title: string;
	description?: string;
	children: React.ReactNode;
	/** Footer navigation */
	onNext?: () => void;
	onBack?: () => void;
	nextLabel?: string;
	nextDisabled?: boolean;
	isSaving?: boolean;
	/** Hide the default footer (e.g. intro/results render their own CTAs). */
	hideFooter?: boolean;
	className?: string;
}

/**
 * Standard card shell for a retirement wizard step. Matches the dashboard
 * (root) theme rather than the onboarding glassmorphism.
 */
export function RetirementStepShell({
	icon: Icon,
	title,
	description,
	children,
	onNext,
	onBack,
	nextLabel = "Continue",
	nextDisabled = false,
	isSaving = false,
	hideFooter = false,
	className,
}: RetirementStepShellProps) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ type: "spring", stiffness: 300, damping: 28 }}
			className={cn("w-full", className)}
		>
			<Card>
				<CardHeader>
					<div className="flex items-center gap-3">
						<div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
							<Icon className="h-5 w-5" />
						</div>
						<div>
							<CardTitle className="text-2xl">{title}</CardTitle>
							{description && (
								<CardDescription className="mt-1">
									{description}
								</CardDescription>
							)}
						</div>
					</div>
				</CardHeader>
				<CardContent className="space-y-6">{children}</CardContent>
			</Card>

			{!hideFooter && (
				<div className="mt-6 flex items-center justify-between">
					{onBack ? (
						<Button variant="ghost" onClick={onBack} disabled={isSaving}>
							<ArrowLeft className="mr-1 h-4 w-4" />
							Back
						</Button>
					) : (
						<span />
					)}
					{onNext && (
						<Button onClick={onNext} disabled={nextDisabled || isSaving}>
							{isSaving ? "Saving..." : nextLabel}
							{!isSaving && <ArrowRight className="ml-1 h-4 w-4" />}
						</Button>
					)}
				</div>
			)}
		</motion.div>
	);
}
