import type { RetirementInputs } from "@/lib/types/retirement";

export interface RetirementStepProps {
	data: RetirementInputs;
	update: (patch: Partial<RetirementInputs>) => void;
	onNext: () => void;
	onBack: () => void;
	isSaving?: boolean;
}
