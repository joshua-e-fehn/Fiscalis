"use client";

import { useState } from "react";
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
  apiKeyErrorMessage,
  netWorthEndpointUrl,
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
} from "@/hooks/convex";
import type { Id } from "@/convex/_generated/dataModel";
import { MAX_API_KEY_NAME_LENGTH } from "@/../services/apiKeys/apiKeyService";

type ExpiryChoice = "30" | "90" | "365" | "never";

const EXPIRY_LABELS: Record<ExpiryChoice, string> = {
  "30": "30 days",
  "90": "90 days",
  "365": "1 year",
  never: "Never",
};

function formatDate(ms: number | undefined): string {
  return ms === undefined ? "—" : new Date(ms).toLocaleDateString();
}

function keyStatus(k: { revokedAt?: number; expiresAt?: number }) {
  if (k.revokedAt !== undefined) return { label: "Revoked", variant: "secondary" as const };
  if (k.expiresAt !== undefined && k.expiresAt <= Date.now())
    return { label: "Expired", variant: "secondary" as const };
  return { label: "Active", variant: "default" as const };
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
      setError(apiKeyErrorMessage(err, "Could not create API key."));
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (keyId: Id<"apiKeys">) => {
    setError(null);
    try {
      await revokeKey({ keyId });
    } catch (err) {
      setError(
        apiKeyErrorMessage(
          err,
          "Could not revoke the API key. Reload the page and try again.",
        ),
      );
    }
  };

  const curlExample = `curl -H "Authorization: Bearer $FISCALIS_API_KEY" \\\n  ${endpoint ?? "<endpoint>"}`;

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader
        title="API Keys"
        subtitle="Read your net worth programmatically. Keys are private and scoped to your account."
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
          <CardTitle>Create a key</CardTitle>
          <CardDescription>
            A key grants read-only access to your current net worth. Treat it
            like a password: never commit it or use it in browser code.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleCreate}
            className="flex flex-col gap-4 sm:flex-row sm:items-end"
          >
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="api-key-name">Name</Label>
              <Input
                id="api-key-name"
                placeholder="e.g. Home dashboard"
                value={name}
                maxLength={MAX_API_KEY_NAME_LENGTH}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2 sm:w-40">
              <Label htmlFor="api-key-expiry">Expires</Label>
              <Select
                value={expiry}
                onValueChange={(v) => setExpiry(v as ExpiryChoice)}
              >
                <SelectTrigger id="api-key-expiry">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(EXPIRY_LABELS) as ExpiryChoice[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {EXPIRY_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={isCreating || !name.trim()}>
              {isCreating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Create key
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your keys</CardTitle>
        </CardHeader>
        <CardContent>
          {keys === undefined ? (
            <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
          ) : keys.length === 0 ? (
            <p className="text-muted-foreground text-sm">No API keys yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => {
                  const status = keyStatus(k);
                  return (
                    <TableRow key={k._id}>
                      <TableCell className="font-medium">{k.name}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {k.keyPrefix}…
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell>{formatDate(k.createdAt)}</TableCell>
                      <TableCell>
                        {k.expiresAt === undefined ? "Never" : formatDate(k.expiresAt)}
                      </TableCell>
                      <TableCell>{formatDate(k.lastUsedAt)}</TableCell>
                      <TableCell className="text-right">
                        {k.revokedAt === undefined && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                Revoke
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Revoke “{k.name}”?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Requests using this key will be rejected
                                  immediately. This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleRevoke(k._id)}
                                >
                                  Revoke
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
          <CardTitle>Usage</CardTitle>
          <CardDescription>
            Send the key in the Authorization header. Keys in URLs are not
            accepted. Each key is limited to 60 requests per minute.
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
  "asOf": "2026-01-01T12:00:00.000Z"
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
              <KeyRound className="h-5 w-5" /> Copy your new API key
            </DialogTitle>
            <DialogDescription>
              This is the only time the key will be shown. Store it somewhere
              safe, such as a password manager or secret store.
            </DialogDescription>
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
              <CopyButton value={newKey} label="Copy API key" />
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setNewKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
