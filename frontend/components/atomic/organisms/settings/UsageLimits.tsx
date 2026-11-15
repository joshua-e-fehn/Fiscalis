"use client";

/**
 * UsageLimits (ENG-199): Settings > Limits, the plan's limits against what
 * the user uses (billing.usage). The limits are enforced on the server;
 * this only shows them.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { Button } from "@/components/ui/shadcn/button";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { usePlanUsage } from "@/hooks/convex";
import { usageShare, type UsageRow } from "@/../services/billing/plans";

function UsageLine({ row }: { row: UsageRow }) {
  const t = useTranslations("billing.limits");
  const share = usageShare(row);
  const value =
    row.limit === 0
      ? t("notIncluded")
      : row.limit === null
        ? t("usedUnlimited", { used: row.used })
        : t("usedOf", { used: row.used, limit: row.limit });

  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="font-medium">{t(`rows.${row.key}`)}</span>
        <span className="text-muted-foreground tabular-nums">{value}</span>
      </div>
      {share !== null && (
        <div
          className="bg-muted h-2 w-full overflow-hidden rounded-full"
          role="progressbar"
          aria-label={t(`rows.${row.key}`)}
          aria-valuemin={0}
          aria-valuemax={row.limit ?? 0}
          aria-valuenow={row.used}
        >
          <div
            className={share >= 1 ? "bg-destructive h-full" : "bg-primary h-full"}
            style={{ width: `${Math.round(share * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function UsageLimits() {
  const t = useTranslations("billing.limits");
  const tPlans = useTranslations("billing.plans");
  const usage = usePlanUsage();

  if (usage === undefined) return <Skeleton className="h-48 w-full" />;
  if (usage === null) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("card.title")}</CardTitle>
        <CardDescription>{t("card.description", { plan: tPlans(usage.plan) })}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col">
        <div className="divide-y">
          {usage.rows.map((row) => (
            <UsageLine key={row.key} row={row} />
          ))}
        </div>
        {usage.plan === "free" && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
            <p className="text-muted-foreground text-sm">{t("upgradeHint")}</p>
            <Button asChild size="sm">
              <Link href="/settings/billing">{t("upgrade")}</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
