"use client";

import { SnaptradeConnectButton } from "@/components/atomic/atoms/snaptradeConnectButton";

/**
 * "Add Broker" opens the SnapTrade connection portal (useSnaptradeConnect,
 * via SnaptradeConnectButton). SnapTrade lists the supported brokers itself.
 */
export function AddBrokerButton() {
  return <SnaptradeConnectButton buttonText="Add Broker" />;
}
