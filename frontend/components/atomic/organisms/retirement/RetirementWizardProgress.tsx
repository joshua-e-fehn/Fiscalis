"use client";

import { Check } from "lucide-react";
import { RETIREMENT_STEP_LABELS, RetirementStep } from "@/lib/types/retirement";
import { cn } from "@/lib/utils";

interface RetirementWizardProgressProps {
	currentStep: RetirementStep;
	onStepClick?: (step: RetirementStep) => void;
}

const STEPS = Object.values(RetirementStep).filter(
	(v): v is RetirementStep => typeof v === "number",
);

export function RetirementWizardProgress({
	currentStep,
	onStepClick,
}: RetirementWizardProgressProps) {
	const n = STEPS.length;
	const pct = ((currentStep - 1) / (n - 1)) * 100;
	return (
		<div className="w-full">
			{/* Desktop — circles anchored edge-to-edge, line connects their centers */}
			<div className="relative hidden pb-6 md:block">
				{/* Track (first circle center → last circle center; circles are 28px) */}
				<div className="absolute top-[14px] right-[14px] left-[14px] h-0.5 -translate-y-1/2 bg-border" />
				<div
					className="absolute top-[14px] left-[14px] h-0.5 -translate-y-1/2 bg-primary transition-all duration-300"
					style={{ width: `calc((100% - 28px) * ${pct} / 100)` }}
				/>

				<div className="relative flex justify-between">
					{STEPS.map((step, i) => {
						const done = step < currentStep;
						const active = step === currentStep;
						const reachable = step <= currentStep;
						const isFirst = i === 0;
						const isLast = i === n - 1;
						return (
							<button
								key={step}
								type="button"
								disabled={!reachable || !onStepClick}
								onClick={() => reachable && onStepClick?.(step)}
								className={cn(
									"relative flex flex-col items-center",
									reachable && onStepClick && "cursor-pointer",
								)}
							>
								<span
									className={cn(
										"flex h-7 w-7 items-center justify-center rounded-full border text-xs font-medium transition-colors",
										done && "border-primary bg-primary text-primary-foreground",
										active && "border-primary bg-background text-primary",
										!done &&
											!active &&
											"border-border bg-background text-muted-foreground",
									)}
								>
									{done ? <Check className="h-3.5 w-3.5" /> : step}
								</span>
								<span
									className={cn(
										"absolute top-9 whitespace-nowrap text-[11px]",
										isFirst
											? "left-0"
											: isLast
												? "right-0"
												: "left-1/2 -translate-x-1/2",
										active
											? "font-medium text-foreground"
											: "text-muted-foreground",
									)}
								>
									{RETIREMENT_STEP_LABELS[step]}
								</span>
							</button>
						);
					})}
				</div>
			</div>

			{/* Mobile */}
			<div className="md:hidden">
				<div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
					<span>
						Step {currentStep} of {n}
					</span>
					<span>{RETIREMENT_STEP_LABELS[currentStep]}</span>
				</div>
				<div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
					<div
						className="h-full rounded-full bg-primary transition-all duration-300"
						style={{ width: `${pct}%` }}
					/>
				</div>
			</div>
		</div>
	);
}
