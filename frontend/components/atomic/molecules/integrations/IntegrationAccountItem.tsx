"use client";

/**
 * IntegrationAccountItem Component
 *
 * Displays a single account/position within an integration connection.
 * Used inside IntegrationConnectionCard for nested account lists.
 */

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/currency";

interface IntegrationAccountItemProps {
  /** Account name (e.g., "Checking Account", "Individual Brokerage") */
  name: string;
  /** Account type label, already translated, or the provider's raw type */
  type?: string;
  /** Masked account number (e.g., "****1234") */
  accountNumber?: string;
  /** Account balance (total value) */
  balance: number;
  /** Cash balance (available cash) */
  cash?: number;
  /** Currency code (e.g., "USD", "EUR") */
  currency: string;
  /** Optional icon to show before the name */
  icon?: React.ReactNode;
  /** Optional line under the type (e.g. the category the account counts as) */
  detail?: React.ReactNode;
  /** Optional row actions, shown after the balance */
  actions?: React.ReactNode;
  /** Additional class names */
  className?: string;
  /** Click handler for the item */
  onClick?: () => void;
}

export function IntegrationAccountItem({
  name,
  type,
  accountNumber,
  balance,
  cash,
  currency,
  icon,
  detail,
  actions,
  className,
  onClick,
}: IntegrationAccountItemProps) {
  const t = useTranslations("integrations.connection");
  const formatAmount = (amount: number) =>
    formatCurrency(amount, currency, { fractionDigits: 0 });

  const formattedBalance = formatAmount(balance);
  // Show cash if it's > 0 (always show, even if equal to balance)
  const hasCash = cash !== undefined && cash !== null && cash > 0;

  return (
    <div
      className={cn(
        "flex items-center justify-between p-3 rounded-lg border bg-card/50 hover:bg-accent/50 transition-colors",
        onClick && "cursor-pointer",
        className,
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <div className="flex-shrink-0 text-muted-foreground">{icon}</div>
        )}
        <div className="min-w-0">
          <p className="font-medium truncate">{name}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {type && <span className="capitalize">{type}</span>}
            {type && accountNumber && <span>•</span>}
            {accountNumber && <span>{accountNumber}</span>}
          </div>
          {detail && (
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              {detail}
            </div>
          )}
        </div>
      </div>
      <div className="text-end flex-shrink-0 ms-4">
        <p className="font-semibold">{formattedBalance}</p>
        {hasCash && (
          <p className="text-xs text-muted-foreground">
            {t("cash", { amount: formatAmount(cash) })}
          </p>
        )}
      </div>
      {actions && <div className="ms-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}

export default IntegrationAccountItem;
