import type { RetirementInputs } from "@/lib/types/retirement";

export interface RetirementStepProps {
	data: RetirementInputs;
	update: (patch: Partial<RetirementInputs>) => void;
	onNext: () => void;
	onBack: () => void;
	isSaving?: boolean;
	/** The currency `data`'s amounts are in (the one the wizard was filled in) */
	currency?: string;
}
