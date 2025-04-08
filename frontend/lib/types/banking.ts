export type PlaidAccount = {
  id: string;
  name: string;
  mask: string | null;
  type: string;
  subtype: string | null;
  balance?: {
    current: number;
    available: number;
    limit: number | null;
    currency: string;
  };
  institution?: {
    id: string | null;
    name: string | null;
    itemId: string;
  };
};
