"use client";

/**
 * BillingSettings (ENG-198, ENG-203): the current plan, upgrade to Pro via
 * Stripe Checkout, subscription management in the Stripe customer portal,
 * and the recent invoices. Everything comes from billing.overview; the
 * plan itself is decided and enforced on the server (convex/lib/plan.ts).
 */

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Check, ExternalLink, Loader2, Sparkles } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/shadcn/table";
import {
  useBillingOverview,
  useCreateCheckoutSession,
  useCreatePortalSession,
} from "@/hooks/convex";
import { useErrorMessage } from "@/i18n/errors";
import { formatCurrency } from "@/lib/utils/currency";
import type { BillingInterval } from "@/../services/billing/plans";

type Overview = NonNullable<ReturnType<typeof useBillingOverview>>;

const INVOICE_STATUSES = ["draft", "open", "paid", "void", "uncollectible", "failed"] as const;
type InvoiceStatus = (typeof INVOICE_STATUSES)[number] | "other";

function invoiceStatus(status: string): InvoiceStatus {
  return (INVOICE_STATUSES as readonly string[]).includes(status)
    ? (status as InvoiceStatus)
    : "other";
}

function ErrorText({ children }: { children: string }) {
  return (
    <p className="text-destructive text-sm" role="alert">
      {children}
    </p>
  );
}

/** Sends the browser to a Stripe-hosted page from `start`. */
function useStripeRedirect<A>(start: (args: A) => Promise<{ url: string }>) {
  const errorMessage = useErrorMessage();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async (args: A) => {
    setError(null);
    setPending(true);
    try {
      const { url } = await start(args);
      window.location.assign(url);
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  };
  return { go, pending, error };
}

function CheckoutNotice() {
  const t = useTranslations("billing.billing.checkout");
  const checkout = useSearchParams().get("checkout");
  if (checkout !== "success" && checkout !== "canceled") return null;
  return (
    <Alert>
      <AlertDescription>{t(checkout)}</AlertDescription>
    </Alert>
  );
}

function CurrentPlanCard({ overview }: { overview: Overview }) {
  const t = useTranslations("billing.billing.current");
  const tPlans = useTranslations("billing.plans");
  const format = useFormatter();
  const createPortalSession = useCreatePortalSession();
  const portal = useStripeRedirect(createPortalSession);
  const { subscription } = overview;
  const date = (ms: number) => format.dateTime(new Date(ms), "date");

  const source =
    overview.source === "subscription"
      ? t("sourceSubscription")
      : overview.source === "grant"
        ? t("sourceGrant")
        : t("sourceDefault");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-semibold">{tPlans(overview.plan)}</span>
          <Badge variant={overview.plan === "pro" ? "default" : "secondary"}>{source}</Badge>
        </div>

        {subscription && overview.source === "subscription" && (
          <div className="text-muted-foreground flex flex-col gap-1 text-sm">
            {subscription.interval && (
              <span>
                {subscription.interval === "year" ? t("intervalYear") : t("intervalMonth")}
              </span>
            )}
            <span>
              {subscription.cancelAtPeriodEnd
                ? t("endsOn", { date: date(subscription.currentPeriodEnd) })
                : t("renews", { date: date(subscription.currentPeriodEnd) })}
            </span>
          </div>
        )}
        {subscription?.status === "past_due" && (
          <Alert variant="destructive">
            <AlertDescription>{t("pastDue")}</AlertDescription>
          </Alert>
        )}
        {subscription && overview.source !== "subscription" && (
          <p className="text-muted-foreground text-sm">{t("ended")}</p>
        )}

        {overview.hasCustomer && (
          <>
            <p className="text-muted-foreground text-sm">{t("manageHint")}</p>
            <Button variant="outline" onClick={() => portal.go({})} disabled={portal.pending}>
              {portal.pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              {t("manage")}
            </Button>
          </>
        )}
        {portal.error && <ErrorText>{portal.error}</ErrorText>}
      </CardContent>
    </Card>
  );
}

function UpgradeCard({ overview }: { overview: Overview }) {
  const t = useTranslations("billing.billing.upgrade");
  const createCheckoutSession = useCreateCheckoutSession();
  const checkout = useStripeRedirect(createCheckoutSession);
  const offered = (["month", "year"] as const).filter((i) => overview.intervals[i]);
  const [interval, setBillingInterval] = useState<BillingInterval>(offered[0] ?? "month");

  const price = (i: BillingInterval) => {
    const { amount, currency } = overview.prices[i];
    const formatted = formatCurrency(amount, currency);
    return i === "year" ? t("perYear", { price: formatted }) : t("perMonth", { price: formatted });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-4">
        <ul className="flex flex-col gap-1 text-sm">
          {(["connections", "apiKeys", "pies"] as const).map((feature) => (
            <li key={feature} className="flex items-center gap-2">
              <Check className="text-primary h-4 w-4" />
              {t(`features.${feature}`)}
            </li>
          ))}
        </ul>

        {overview.source === "grant" && (
          <p className="text-muted-foreground text-sm">{t("grantNote")}</p>
        )}

        {overview.checkoutAvailable ? (
          <>
            {offered.length > 1 && (
              <div className="flex gap-2" role="radiogroup">
                {offered.map((i) => (
                  <Button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={interval === i}
                    variant={interval === i ? "default" : "outline"}
                    size="sm"
                    onClick={() => setBillingInterval(i)}
                  >
                    {t(i)}
                  </Button>
                ))}
              </div>
            )}
            <p className="text-lg font-semibold">{price(interval)}</p>
            <Button onClick={() => checkout.go({ interval })} disabled={checkout.pending}>
              {checkout.pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("submit")}
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">{t("unavailable")}</p>
        )}
        {checkout.error && <ErrorText>{checkout.error}</ErrorText>}
      </CardContent>
    </Card>
  );
}

function InvoicesCard({ invoices }: { invoices: Overview["invoices"] }) {
  const t = useTranslations("billing.billing.invoices");
  const format = useFormatter();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {invoices.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("date")}</TableHead>
                <TableHead className="text-right">{t("amount")}</TableHead>
                <TableHead>{t("status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => {
                const status = invoiceStatus(invoice.status);
                return (
                  <TableRow key={invoice.id}>
                    <TableCell>{format.dateTime(new Date(invoice.created), "date")}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(
                        status === "paid" ? invoice.amountPaid : invoice.amountDue,
                        invoice.currency,
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={status === "paid" ? "default" : "secondary"}>
                        {t(`statuses.${status}`)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function BillingSettings() {
  const overview = useBillingOverview();

  if (overview === undefined) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (overview === null) return null;

  return (
    <div className="flex flex-col gap-6">
      <CheckoutNotice />
      <CurrentPlanCard overview={overview} />
      {overview.source !== "subscription" && <UpgradeCard overview={overview} />}
      {(overview.hasCustomer || overview.invoices.length > 0) && (
        <InvoicesCard invoices={overview.invoices} />
      )}
    </div>
  );
}
