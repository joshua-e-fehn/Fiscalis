"use client";

import {
	ArrowRight,
	CalendarClock,
	LineChart,
	PiggyBank,
	Wallet,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent } from "@/components/ui/shadcn/card";

interface IntroStepProps {
	onNext: () => void;
	hasExistingPlan?: boolean;
}

const POINTS = [
	{ key: "age", icon: CalendarClock },
	{ key: "pensions", icon: Wallet },
	{ key: "number", icon: LineChart },
] as const;

export function IntroStep({ onNext, hasExistingPlan }: IntroStepProps) {
	const t = useTranslations("retirement.introStep");
	return (
		<div className="w-full">
			<Card>
				<CardContent className="space-y-8 py-10 text-center">
					<div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
						<PiggyBank className="h-8 w-8" />
					</div>
					<div className="space-y-2">
						<h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
						<p className="mx-auto max-w-md text-muted-foreground">
							{t("body")}
						</p>
					</div>

					<div className="grid gap-4 text-left sm:grid-cols-3">
						{POINTS.map((p) => (
							<div key={p.key} className="space-y-2">
								<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground">
									<p.icon className="h-4 w-4" />
								</div>
								<p className="text-sm font-medium">
									{t(`points.${p.key}.title`)}
								</p>
								<p className="text-xs text-muted-foreground">
									{t(`points.${p.key}.body`)}
								</p>
							</div>
						))}
					</div>

					<Button size="lg" onClick={onNext} className="w-full sm:w-auto">
						{hasExistingPlan ? t("reviewPlan") : t("getStarted")}
						<ArrowRight className="ml-1 h-4 w-4" />
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
