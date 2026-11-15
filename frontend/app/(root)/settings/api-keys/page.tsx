"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Check, Copy, KeyRound, Loader2, Plus } from "lucide-react";

import { PageHeader } from "@/components/atomic/molecules/investments";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Badge } from "@/components/ui/shadcn/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/shadcn/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/shadcn/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/shadcn/alert-dialog";
import {
  netWorthEndpointUrl,
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
} from "@/hooks/convex";
import type { Id } from "@/convex/_generated/dataModel";
import { useErrorMessage } from "@/i18n/errors";
import {
  API_KEY_RATE_LIMIT,
  MAX_API_KEY_NAME_LENGTH,
} from "@/../services/apiKeys/apiKeyService";

const EXPIRY_CHOICES = ["30", "90", "365", "never"] as const;
type ExpiryChoice = (typeof EXPIRY_CHOICES)[number];

type KeyStatus = "active" | "revoked" | "expired";

function keyStatus(k: { revokedAt?: number; expiresAt?: number }): {
  status: KeyStatus;
  variant: "default" | "secondary";
} {
  if (k.revokedAt !== undefined) return { status: "revoked", variant: "secondary" };
  if (k.expiresAt !== undefined && k.expiresAt <= Date.now())
    return { status: "expired", variant: "secondary" };
  return { status: "active", variant: "default" };
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={label}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

export default function ApiKeysPage() {
  const t = useTranslations("settings.apiKeys");
  const tActions = useTranslations("common.actions");
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const keys = useApiKeys();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();
  const endpoint = netWorthEndpointUrl();

  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState<ExpiryChoice>("90");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Plaintext key lives only in this state, only until the dialog closes.
  const [newKey, setNewKey] = useState<string | null>(null);

  const formatDate = (ms: number | undefined) =>
    ms === undefined ? t("list.none") : format.dateTime(new Date(ms), "date");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsCreating(true);
    try {
      const result = await createKey({
        name,
        expiresInDays:
          expiry === "never" ? null : (Number(expiry) as 30 | 90 | 365),
      });
      setNewKey(result.key);
      setName("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (keyId: Id<"apiKeys">) => {
    setError(null);
    try {
      await revokeKey({ keyId });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const curlExample = `curl -H "Authorization: Bearer $FISCALIS_API_KEY" \\\n  ${endpoint ?? "<endpoint>"}`;

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
      />

      {error && (
        <p
          className="border-destructive/50 text-destructive rounded-md border px-4 py-3 text-sm"
          role="alert"
        >
          {error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("create.title")}</CardTitle>
          <CardDescription>{t("create.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleCreate}
            className="flex flex-col gap-4 sm:flex-row sm:items-end"
          >
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="api-key-name">{t("create.name")}</Label>
              <Input
                id="api-key-name"
                placeholder={t("create.namePlaceholder")}
                value={name}
                maxLength={MAX_API_KEY_NAME_LENGTH}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2 sm:w-40">
              <Label htmlFor="api-key-expiry">{t("create.expires")}</Label>
              <Select
                value={expiry}
                onValueChange={(v) => setExpiry(v as ExpiryChoice)}
              >
                <SelectTrigger id="api-key-expiry">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY_CHOICES.map((k) => (
                    <SelectItem key={k} value={k}>
                      {t(`expiry.${k}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={isCreating || !name.trim()}>
              {isCreating ? (
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="me-2 h-4 w-4" />
              )}
              {t("create.submit")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("list.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {keys === undefined ? (
            <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
          ) : keys.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("list.empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("list.name")}</TableHead>
                  <TableHead>{t("list.key")}</TableHead>
                  <TableHead>{t("list.status")}</TableHead>
                  <TableHead>{t("list.created")}</TableHead>
                  <TableHead>{t("list.expires")}</TableHead>
                  <TableHead>{t("list.lastUsed")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => {
                  const { status, variant } = keyStatus(k);
                  return (
                    <TableRow key={k._id}>
                      <TableCell className="font-medium">{k.name}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {k.keyPrefix}…
                      </TableCell>
                      <TableCell>
                        <Badge variant={variant}>{t(`status.${status}`)}</Badge>
                      </TableCell>
                      <TableCell>{formatDate(k.createdAt)}</TableCell>
                      <TableCell>
                        {k.expiresAt === undefined
                          ? t("list.never")
                          : formatDate(k.expiresAt)}
                      </TableCell>
                      <TableCell>{formatDate(k.lastUsedAt)}</TableCell>
                      <TableCell className="text-end">
                        {k.revokedAt === undefined && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                {t("revoke.button")}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {t("revoke.title", { name: k.name })}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("revoke.description")}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>
                                  {tActions("cancel")}
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleRevoke(k._id)}
                                >
                                  {t("revoke.confirm")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("usage.title")}</CardTitle>
          <CardDescription>
            {t.rich("usage.description", {
              limit: API_KEY_RATE_LIMIT.maxRequests,
              code: (chunks) => <code>{chunks}</code>,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
            {curlExample}
          </pre>
          <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
            {`{
  "object": "net_worth",
  "netWorth": 123456.78,
  "totalAssets": 150000.00,
  "totalLiabilities": 26543.22,
  "currency": "EUR",
  "fxRateDate": null,
  "asOf": "2026-01-01T12:00:00.000Z",
  "dataAsOf": "2026-01-01T06:00:41.000Z",
  "categories": [
    {
      "category": "cash",
      "value": 20000.00,
      "subcategories": [
        { "subcategory": "savings-accounts", "value": 14000.00 },
        { "subcategory": "checking-accounts", "value": 6000.00 }
      ],
      "sources": [{ "source": "bank", "value": 20000.00 }]
    },
    ...
    {
      "category": "liabilities",
      "value": 26543.22,
      "subcategories": [{ "subcategory": "loans", "value": 26543.22 }],
      "sources": [{ "source": "loan", "value": 26543.22 }]
    }
  ]
}`}
          </pre>
        </CardContent>
      </Card>

      <Dialog
        open={newKey !== null}
        onOpenChange={(open) => {
          if (!open) setNewKey(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" /> {t("newKey.title")}
            </DialogTitle>
            <DialogDescription>{t("newKey.description")}</DialogDescription>
          </DialogHeader>
          {newKey && (
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={newKey}
                className="font-mono text-xs"
                autoComplete="off"
                spellCheck={false}
                onFocus={(e) => e.currentTarget.select()}
              />
              <CopyButton value={newKey} label={t("newKey.copy")} />
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setNewKey(null)}>{t("newKey.done")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
