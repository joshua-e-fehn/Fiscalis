"use client";

/**
 * IntegrationAccountItem Component
 *
 * Displays a single account/position within an integration connection.
 * Used inside IntegrationConnectionCard for nested account lists.
 */

import { cn } from "@/lib/utils";

interface IntegrationAccountItemProps {
  /** Account name (e.g., "Checking Account", "Individual Brokerage") */
  name: string;
  /** Account type label (e.g., "checking", "savings", "brokerage") */
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
  className,
  onClick,
}: IntegrationAccountItemProps) {
  const formatAmount = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);

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
        </div>
      </div>
      <div className="text-right flex-shrink-0 ml-4">
        <p className="font-semibold">{formattedBalance}</p>
        {hasCash && (
          <p className="text-xs text-muted-foreground">
            {formatAmount(cash)} cash
          </p>
        )}
      </div>
    </div>
  );
}

export default IntegrationAccountItem;
