"use client";

import { motion } from "framer-motion";
import {
	ArrowRight,
	CalendarClock,
	LineChart,
	PiggyBank,
	Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent } from "@/components/ui/shadcn/card";

interface IntroStepProps {
	onNext: () => void;
	hasExistingPlan?: boolean;
}

const POINTS = [
	{
		icon: CalendarClock,
		title: "Pick your retirement age",
		body: "Tell us when you'd like to stop working and the lifestyle you want.",
	},
	{
		icon: Wallet,
		title: "Add your pension income",
		body: "State, company or private pensions cover part of your monthly costs.",
	},
	{
		icon: LineChart,
		title: "See your number",
		body: "We use the 4% rule to compute the portfolio you need — and how much to save each month to get there.",
	},
];

export function IntroStep({ onNext, hasExistingPlan }: IntroStepProps) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ type: "spring", stiffness: 300, damping: 28 }}
			className="w-full"
		>
			<Card>
				<CardContent className="space-y-8 py-10 text-center">
					<div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
						<PiggyBank className="h-8 w-8" />
					</div>
					<div className="space-y-2">
						<h1 className="text-3xl font-bold tracking-tight">
							Plan your retirement
						</h1>
						<p className="mx-auto max-w-md text-muted-foreground">
							A few quick questions to turn your retirement goal into a
							concrete, trackable savings plan — grounded in your real
							portfolio.
						</p>
					</div>

					<div className="grid gap-4 text-left sm:grid-cols-3">
						{POINTS.map((p) => (
							<div key={p.title} className="space-y-2">
								<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground">
									<p.icon className="h-4 w-4" />
								</div>
								<p className="text-sm font-medium">{p.title}</p>
								<p className="text-xs text-muted-foreground">{p.body}</p>
							</div>
						))}
					</div>

					<Button size="lg" onClick={onNext} className="w-full sm:w-auto">
						{hasExistingPlan ? "Review my plan" : "Get started"}
						<ArrowRight className="ml-1 h-4 w-4" />
					</Button>
				</CardContent>
			</Card>
		</motion.div>
	);
}
