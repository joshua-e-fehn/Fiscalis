"use client";

/**
 * BankAccountsCard Component
 *
 * Displays a single bank institution with its connected accounts.
 * Uses the unified IntegrationConnectionCard for consistent styling.
 */

import {
  Landmark,
  CreditCard,
  Wallet,
  PiggyBank,
  Building2,
  AlertCircle,
} from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useDeletePlaidItem, useRefreshAccounts } from "@/hooks/convex";
import { useSyncContextSafe } from "@/providers/syncProvider";
import {
  bankAccountTotals,
  type BankAccountTotalsLike,
} from "@/../services/portfolio/categorySummary";
import {
  IntegrationConnectionCard,
  IntegrationAccountItem,
} from "@/components/atomic/molecules/integrations";
import {
  CategoryOverrideMenu,
  ManualCategoryBadge,
} from "@/components/atomic/molecules/classification";
import { hasUserOverride } from "@/../services/classification";
import { useCategoryLabels } from "@/lib/config/categoryUI";
import { PlaidUpdateButton } from "@/components/atomic/atoms/plaidUpdateButton";
import {
  consentNotice,
  type ConsentFields,
} from "@/../services/banking/consentExpiry";

// Type for Convex account data, with the stored EUR value the totals read
interface ConvexAccount extends BankAccountTotalsLike {
  _id: string;
  accountId: string;
  itemId: string;
  name: string;
  officialName?: string;
  type: string;
  subtype?: string;
  mask?: string;
  currentBalance?: number;
  availableBalance?: number;
  currency: string;
  lastSynced?: number;
  investmentCategory?: string;
  investmentSubcategory?: string;
  userCategoryOverride?: string;
  userSubcategoryOverride?: string;
}

interface BankAccountsCardProps {
  itemId: string;
  institutionName: string;
  institutionLogo?: string; // Base64-encoded PNG from Plaid
  institutionPrimaryColor?: string; // Hex color code from Plaid
  accounts: ConvexAccount[];
  /** End of consent and expected disconnect, for the renewal notice */
  consent?: ConsentFields;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Asks the user to renew the bank's consent (Plaid update mode) once it
 * ends within CONSENT_WARNING_DAYS or has ended (ENG-240).
 */
function ConsentNotice({
  itemId,
  institutionName,
  consent,
}: {
  itemId: string;
  institutionName: string;
  consent: ConsentFields;
}) {
  const t = useTranslations("integrations.banking.consent");
  const format = useFormatter();
  const now = useNow({ updateInterval: HOUR_MS });
  const notice = consentNotice(consent, now.getTime());
  if (!notice) return null;

  return (
    <div
      role="status"
      className="mb-3 flex flex-col gap-3 rounded-lg border border-yellow-200 bg-yellow-50/50 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-yellow-900 dark:bg-yellow-950/20"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-600 dark:text-yellow-400" />
        <div>
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            {notice.kind === "expired"
              ? t("expiredTitle")
              : t("expiringTitle", { days: notice.daysLeft })}
          </p>
          <p className="text-sm text-muted-foreground">
            {notice.kind === "expired"
              ? t("expiredDescription")
              : t("expiringDescription", {
                  date: format.dateTime(notice.at, "date"),
                })}
          </p>
        </div>
      </div>
      <PlaidUpdateButton item={{ itemId, institutionName, status: "active" }} />
    </div>
  );
}

/** Plaid account types and subtypes with a label under banking.accountTypes */
const ACCOUNT_TYPE_KEYS = {
  checking: "checking",
  savings: "savings",
  "money market": "moneyMarket",
  cd: "cd",
  "cash management": "cashManagement",
  prepaid: "prepaid",
  paypal: "paypal",
  depository: "depository",
  "credit card": "creditCard",
  credit: "credit",
  loan: "loan",
  mortgage: "mortgage",
  student: "student",
  auto: "auto",
  investment: "investment",
  brokerage: "brokerage",
} as const;

type AccountTypeKey = (typeof ACCOUNT_TYPE_KEYS)[keyof typeof ACCOUNT_TYPE_KEYS];

/** The catalogue key for a Plaid type or subtype, if it has one. */
function accountTypeKey(raw: string): AccountTypeKey | undefined {
  const normalized = raw.toLowerCase();
  return Object.hasOwn(ACCOUNT_TYPE_KEYS, normalized)
    ? ACCOUNT_TYPE_KEYS[normalized as keyof typeof ACCOUNT_TYPE_KEYS]
    : undefined;
}

// Get icon for account type
function getAccountIcon(type: string, subtype?: string) {
  const t = type.toLowerCase();
  const s = subtype?.toLowerCase() || "";

  if (t === "credit" || s.includes("credit")) {
    return <CreditCard className="h-4 w-4" />;
  }
  if (s.includes("savings") || s.includes("money market")) {
    return <PiggyBank className="h-4 w-4" />;
  }
  if (t === "investment" || s.includes("brokerage")) {
    return <Building2 className="h-4 w-4" />;
  }
  return <Wallet className="h-4 w-4" />;
}

export function BankAccountsCard({
  itemId,
  institutionName,
  institutionLogo,
  institutionPrimaryColor,
  accounts,
  consent,
}: BankAccountsCardProps) {
  const t = useTranslations("integrations.banking");
  const tNotices = useTranslations("integrations.connectionNotices");
  const labels = useCategoryLabels();
  const deleteItem = useDeletePlaidItem();
  const refreshAccounts = useRefreshAccounts();

  // Get global sync state (may be undefined if outside SyncProvider)
  const syncContext = useSyncContextSafe();
  const isGlobalPlaidSyncing = syncContext?.isPlaidSyncing ?? false;

  // Combine local and global sync state
  const isSyncing = refreshAccounts.isLoading || isGlobalPlaidSyncing;

  if (!accounts || accounts.length === 0) {
    return null;
  }

  // Known Plaid types are translated; others show as Plaid sends them
  const accountTypeLabel = (raw: string) => {
    const key = accountTypeKey(raw);
    return key ? t(`accountTypes.${key}`) : raw;
  };

  // A failed revoke at Plaid keeps the bank (ENG-225); the hook keeps the
  // error, shown on the card, so the user can retry
  const handleDisconnect = async () => {
    await deleteItem.mutate(itemId).catch(() => undefined);
  };

  const handleSync = async () => {
    await refreshAccounts.mutate(itemId);
  };

  // The institution's net balance in EUR from each account's stored EUR
  // value, debts subtracted (as on the Bank Accounts page and in net
  // worth), so accounts in different currencies add up
  const totalBalanceEur = bankAccountTotals(accounts).net;

  // Get the most recent sync time from accounts
  const lastSyncAt =
    accounts.reduce((latest, acc) => {
      if (acc.lastSynced && acc.lastSynced > latest) {
        return acc.lastSynced;
      }
      return latest;
    }, 0) || undefined;

  // Prepare logo - Plaid sends base64 encoded PNGs
  const logoUrl = institutionLogo
    ? `data:image/png;base64,${institutionLogo}`
    : undefined;

  // Fallback icon with institution color
  const fallbackIcon = (
    <Landmark
      className="h-5 w-5"
      style={{
        color: institutionPrimaryColor || "hsl(var(--primary))",
      }}
    />
  );

  return (
    <IntegrationConnectionCard
      name={institutionName}
      logo={logoUrl}
      fallbackIcon={fallbackIcon}
      status="connected"
      totalValueEur={totalBalanceEur}
      lastSyncAt={lastSyncAt}
      errorMessage={deleteItem.error ? tNotices("disconnectFailed") : undefined}
      secondaryInfo={t("accounts", { count: accounts.length })}
      onSync={handleSync}
      onDisconnect={handleDisconnect}
      isSyncing={isSyncing}
      isDisconnecting={deleteItem.isLoading}
    >
      {consent && (
        <ConsentNotice
          itemId={itemId}
          institutionName={institutionName}
          consent={consent}
        />
      )}
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {[...accounts]
          .sort((a, b) => {
            const balanceA = a.currentBalance || a.availableBalance || 0;
            const balanceB = b.currentBalance || b.availableBalance || 0;
            return balanceB - balanceA; // Descending order
          })
          .map((account) => {
            const isManual = hasUserOverride(account);
            return (
              <IntegrationAccountItem
                key={account._id}
                name={account.name}
                type={accountTypeLabel(account.subtype || account.type)}
                accountNumber={account.mask ? `****${account.mask}` : undefined}
                balance={
                  account.currentBalance || account.availableBalance || 0
                }
                currency={account.currency}
                icon={getAccountIcon(account.type, account.subtype)}
                detail={
                  account.investmentCategory && (
                    <>
                      <span>
                        {labels.categoryNameOf(account.investmentCategory)}
                      </span>
                      {isManual && <ManualCategoryBadge />}
                    </>
                  )
                }
                actions={
                  <CategoryOverrideMenu
                    item={{ target: "plaid", id: account._id }}
                    name={account.name}
                    category={account.investmentCategory}
                    subcategory={account.investmentSubcategory}
                    isManual={isManual}
                  />
                }
              />
            );
          })}
      </div>
    </IntegrationConnectionCard>
  );
}
