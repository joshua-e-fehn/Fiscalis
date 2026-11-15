"use client";

import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";
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
import { Landmark, AlertCircle, MoreHorizontal, Unlink } from "lucide-react";
import { useDeletePlaidItem } from "@/hooks/convex/banking";
import {
  PlaidUpdateButton,
  ItemNeedingReauth,
} from "@/components/atomic/atoms/plaidUpdateButton";

interface BankReauthCardProps {
  item: ItemNeedingReauth;
}

export function BankReauthCard({ item }: BankReauthCardProps) {
  const t = useTranslations("integrations.banking");
  const tConnection = useTranslations("integrations.connection");
  const tNotices = useTranslations("integrations.connectionNotices");
  const tActions = useTranslations("common.actions");
  const deleteItem = useDeletePlaidItem();
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);

  const institutionName = item.institutionName || t("unknownBank");

  // A failed revoke at Plaid keeps the bank (ENG-225); the hook keeps the
  // error, shown on the card, so the user can retry
  const handleDisconnect = async () => {
    await deleteItem.mutate(item.itemId).catch(() => undefined);
    setShowDisconnectDialog(false);
  };

  return (
    <>
      <Card className="mb-8 border-yellow-200 dark:border-yellow-900 bg-yellow-50/50 dark:bg-yellow-950/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {item.institutionLogo ? (
                <div className="relative">
                  <Image
                    src={`data:image/png;base64,${item.institutionLogo}`}
                    alt={institutionName}
                    width={40}
                    height={40}
                    unoptimized
                    loading="eager"
                    className="h-10 w-10 rounded-lg object-contain"
                  />
                  <div className="absolute -top-1 -end-1 rounded-full bg-yellow-500 p-0.5">
                    <AlertCircle className="h-3 w-3 text-white" />
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center"
                    style={{
                      backgroundColor: item.institutionPrimaryColor
                        ? `${item.institutionPrimaryColor}20`
                        : "hsl(var(--primary) / 0.1)",
                    }}
                  >
                    <Landmark
                      className="h-5 w-5"
                      style={{
                        color:
                          item.institutionPrimaryColor || "hsl(var(--primary))",
                      }}
                    />
                  </div>
                  <div className="absolute -top-1 -end-1 rounded-full bg-yellow-500 p-0.5">
                    <AlertCircle className="h-3 w-3 text-white" />
                  </div>
                </div>
              )}
              <div>
                <CardTitle className="text-lg">{institutionName}</CardTitle>
                <CardDescription className="mt-0.5 text-yellow-700 dark:text-yellow-400">
                  {t("reauth.needsReauth")}
                </CardDescription>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">{tConnection("openMenu")}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setShowDisconnectDialog(true)}
                  disabled={deleteItem.isLoading}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <Unlink className="me-2 h-4 w-4" />
                  {t("reauth.disconnectBank")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          <Card className="border-yellow-200 dark:border-yellow-800 bg-card">
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                    <p className="font-medium text-yellow-800 dark:text-yellow-200">
                      {t("reauth.expiredTitle")}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("reauth.expiredDescription")}
                  </p>
                  {deleteItem.error && (
                    <p className="mt-2 text-sm text-destructive">
                      {tNotices("disconnectFailed")}
                    </p>
                  )}
                </div>
                <PlaidUpdateButton
                  item={item}
                  variant="default"
                  size="default"
                />
              </div>
            </CardContent>
          </Card>
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
              {tConnection("disconnectTitle", { name: institutionName })}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-start">
              {t("reauth.disconnectDescription")}
              <br />
              <br />
              <span className="text-muted-foreground">
                {t("reauth.notAffected")}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tActions("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteItem.isLoading
                ? tConnection("disconnecting")
                : tConnection("disconnect")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
