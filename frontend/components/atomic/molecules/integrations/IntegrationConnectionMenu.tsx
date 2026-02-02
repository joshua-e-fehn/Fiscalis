"use client";

/**
 * IntegrationConnectionMenu Component
 *
 * Three-dot dropdown menu for integration connection actions.
 * Provides sync and disconnect options with confirmation dialog.
 */

import { useState } from "react";
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
import { MoreHorizontal, RefreshCw, Unlink, Loader2 } from "lucide-react";

interface IntegrationConnectionMenuProps {
  /** Name of the connection for display in dialogs */
  connectionName: string;
  /** Called when sync is clicked */
  onSync: () => void;
  /** Called when disconnect is confirmed */
  onDisconnect: () => void;
  /** Whether a sync operation is in progress */
  isSyncing?: boolean;
  /** Whether a disconnect operation is in progress */
  isDisconnecting?: boolean;
  /** Additional info to show in disconnect dialog (e.g., "2 accounts") */
  disconnectInfo?: string;
  /** Custom description for disconnect dialog */
  disconnectDescription?: string;
}

export function IntegrationConnectionMenu({
  connectionName,
  onSync,
  onDisconnect,
  isSyncing = false,
  isDisconnecting = false,
  disconnectInfo,
  disconnectDescription,
}: IntegrationConnectionMenuProps) {
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);

  const handleDisconnect = async () => {
    await onDisconnect();
    setShowDisconnectDialog(false);
  };

  const defaultDescription = disconnectInfo
    ? `This will remove ${disconnectInfo} and their data from your dashboard.`
    : "This will remove this connection and all associated data from your dashboard.";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={onSync}
            disabled={isSyncing}
            className="cursor-pointer"
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`}
            />
            {isSyncing ? "Syncing..." : "Sync"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setShowDisconnectDialog(true)}
            disabled={isDisconnecting}
            className="cursor-pointer text-destructive focus:text-destructive"
          >
            <Unlink className="mr-2 h-4 w-4" />
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={showDisconnectDialog}
        onOpenChange={setShowDisconnectDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Unlink className="h-5 w-5 text-destructive" />
              Disconnect {connectionName}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left">
              {disconnectDescription || defaultDescription}
              <br />
              <br />
              <span className="text-muted-foreground">
                Your actual account will not be affected. You can reconnect at
                any time.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDisconnecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Disconnecting...
                </>
              ) : (
                "Disconnect"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default IntegrationConnectionMenu;
