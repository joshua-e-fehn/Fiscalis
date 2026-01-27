"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/shadcn/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/shadcn/alert-dialog";
import { Button } from "@/components/ui/shadcn/button";
import { Landmark, MoreHorizontal, RefreshCw, Unlink } from "lucide-react";

import { BankAccountCard } from "@/components/atomic/atoms/bankAccountCard";
import { useDeletePlaidItem, useRefreshAccounts } from "@/hooks/convex";

// Type for Convex account data
interface ConvexAccount {
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
}

interface BankAccountsCardProps {
  itemId: string;
  institutionName: string;
  accounts: ConvexAccount[];
}

export function BankAccountsCard({
  itemId,
  institutionName,
  accounts,
}: BankAccountsCardProps) {
  const deleteItem = useDeletePlaidItem();
  const refreshAccounts = useRefreshAccounts();
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);

  if (!accounts || accounts.length === 0) {
    return null;
  }

  const handleDisconnect = async () => {
    await deleteItem.mutate(itemId);
    setShowDisconnectDialog(false);
  };

  const handleRefresh = async () => {
    await refreshAccounts.mutate(itemId);
  };

  return (
    <>
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl flex flex-row items-center gap-2">
                <Landmark className="h-7 w-7" /> {institutionName}
              </CardTitle>
              <CardDescription className="mt-1.5">
                You have connected {accounts.length} account
                {accounts.length !== 1 ? "s" : ""}
              </CardDescription>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={handleRefresh}
                  disabled={refreshAccounts.isLoading}
                  className="cursor-pointer"
                >
                  <RefreshCw
                    className={`mr-2 h-4 w-4 ${refreshAccounts.isLoading ? "animate-spin" : ""}`}
                  />
                  {refreshAccounts.isLoading
                    ? "Refreshing..."
                    : "Refresh accounts"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShowDisconnectDialog(true)}
                  disabled={deleteItem.isLoading}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <Unlink className="mr-2 h-4 w-4" />
                  Disconnect bank
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <BankAccountCard key={account._id} account={account} />
          ))}
        </CardContent>
      </Card>

      <AlertDialog
        open={showDisconnectDialog}
        onOpenChange={setShowDisconnectDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Unlink className="h-5 w-5 text-destructive" />
              Disconnect {institutionName}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left">
              This will remove{" "}
              {accounts.length === 1
                ? "your connected account"
                : `all ${accounts.length} accounts`}{" "}
              from your dashboard.
              <br />
              <br />
              <span className="text-muted-foreground">
                Your actual bank account will not be affected. You can reconnect
                at any time.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteItem.isLoading ? "Disconnecting..." : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
