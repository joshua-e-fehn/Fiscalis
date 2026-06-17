"use client";

import { motion } from "framer-motion";
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/shadcn/button";
import { useRetirementPreview } from "@/hooks/convex/retirement";
import type { RetirementInputs } from "@/lib/types/retirement";
import { RetirementResultsView } from "../RetirementResultsView";

interface ResultsStepProps {
	data: RetirementInputs;
	onBack: () => void;
	onSave: () => void;
	isSaving?: boolean;
	saved?: boolean;
}

export function ResultsStep({
	data,
	onBack,
	onSave,
	isSaving,
	saved,
}: ResultsStepProps) {
	const results = useRetirementPreview(data);

	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ type: "spring", stiffness: 300, damping: 28 }}
			className="w-full space-y-5"
		>
			<RetirementResultsView results={results} />

			<div className="flex items-center justify-between">
				<Button variant="ghost" onClick={onBack} disabled={isSaving}>
					<ArrowLeft className="mr-1 h-4 w-4" />
					Back
				</Button>
				<Button onClick={onSave} disabled={isSaving}>
					{saved ? (
						<>
							<Check className="mr-1 h-4 w-4" />
							Saved
						</>
					) : isSaving ? (
						"Saving..."
					) : (
						"Save my plan"
					)}
				</Button>
			</div>
		</motion.div>
	);
}
