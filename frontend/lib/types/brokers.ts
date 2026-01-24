// Broker types
export type BrokerType = "interactive_brokers";

export type BrokerStatus = "connected" | "disconnected" | "error" | "pending";

export interface BrokerConnection {
  id: number;
  userId: string;
  brokerType: BrokerType;
  connectionName: string;
  status: BrokerStatus;
  accountId: string | null;
  username: string | null;
  lastSyncAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrokerPosition {
  id: number;
  connectionId: number;
  userId: string;
  symbol: string;
  name: string | null;
  quantity: number;
  averageCost: number | null;
  currentPrice: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
  currency: string;
  assetType: string | null;
  lastUpdated: string;
}

export interface CreateBrokerConnectionRequest {
  brokerType: BrokerType;
  connectionName: string;
  accountId?: string;
  username?: string;
}

export interface BrokerInfo {
  type: BrokerType;
  name: string;
  description: string;
  logo?: string;
  supported: boolean;
  comingSoon?: boolean;
}

// Available brokers
export const AVAILABLE_BROKERS: BrokerInfo[] = [
  {
    type: "interactive_brokers",
    name: "Interactive Brokers",
    description: "Professional trading platform with global market access",
    supported: true,
  },
  // Future brokers can be added here
  // {
  //   type: "degiro",
  //   name: "DEGIRO",
  //   description: "European low-cost broker",
  //   supported: false,
  //   comingSoon: true,
  // },
];
