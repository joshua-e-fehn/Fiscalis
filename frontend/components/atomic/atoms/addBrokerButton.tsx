"use client";

import { useTranslations } from "next-intl";
import { SnaptradeConnectButton } from "@/components/atomic/atoms/snaptradeConnectButton";

/**
 * "Add Broker" opens the SnapTrade connection portal (useSnaptradeConnect,
 * via SnaptradeConnectButton). SnapTrade lists the supported brokers itself.
 */
export function AddBrokerButton() {
  const t = useTranslations("integrations.brokers.connect");
  return <SnaptradeConnectButton buttonText={t("add")} />;
}
