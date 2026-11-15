import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

/** "Download my data": every user-owned record, secrets left out. */
export function useExportMyData() {
  return useAction(api.account.exportMyData);
}

/** "Delete my account": revoke providers, then purge and delete the sign-in. */
export function useDeleteMyAccount() {
  return useAction(api.account.deleteMyAccount);
}
