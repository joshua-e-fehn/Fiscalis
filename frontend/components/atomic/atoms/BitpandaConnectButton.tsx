"use client";

/**
 * BitpandaConnectButton
 *
 * Opens a dialog that collects a read-only Bitpanda API key and connects the
 * account. Unlike the OAuth providers, Bitpanda authenticates with a per-user
 * API key the user generates in their Bitpanda account settings — there is no
 * popup / OAuth flow.
 */

import { useState, useCallback } from "react";
import { Loader2, Plus, AlertCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/shadcn/dialog";
import { useConnectBitpanda } from "@/hooks/convex/bitpanda";
import { cn } from "@/lib/utils";

interface BitpandaConnectButtonProps {
  onSuccess?: (connectionId: string) => void;
  onError?: (error: Error) => void;
  buttonVariant?: "default" | "outline" | "ghost" | "secondary";
  size?: "sm" | "default" | "lg";
  className?: string;
  children?: React.ReactNode;
  disabled?: boolean;
}

const BITPANDA_API_KEYS_URL = "https://web.bitpanda.com/apikey";

export function BitpandaConnectButton({
  onSuccess,
  onError,
  buttonVariant = "default",
  size = "default",
  className,
  children,
  disabled = false,
}: BitpandaConnectButtonProps) {
  const { connect, isLoading } = useConnectBitpanda();
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const trimmed = apiKey.trim();
      if (!trimmed) {
        setError("Please paste your Bitpanda API key.");
        return;
      }

      try {
        const result = await connect({
          apiKey: trimmed,
          label: label.trim() || undefined,
        });
        setApiKey("");
        setLabel("");
        setOpen(false);
        onSuccess?.(result.connectionId);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error.message);
        onError?.(error);
      }
    },
    [apiKey, label, connect, onSuccess, onError],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={buttonVariant}
          size={size}
          className={cn("gap-2", className)}
          disabled={disabled}
        >
          <Plus className="h-4 w-4" />
          <span>{children ?? "Connect Bitpanda"}</span>
        </Button>
      </DialogTrigger>

      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Connect Bitpanda</DialogTitle>
            <DialogDescription>
              Paste a <strong>read-only</strong> Bitpanda API key. Fiscalis uses
              it to sync your crypto, metals, commodities, stocks and cash
              holdings. The key is encrypted and never shared.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="bitpanda-api-key">API key</Label>
              <Input
                id="bitpanda-api-key"
                type="password"
                autoComplete="off"
                placeholder="Your read-only Bitpanda API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={isLoading}
              />
              <a
                href={BITPANDA_API_KEYS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Create a read-only key in Bitpanda
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bitpanda-label">Label (optional)</Label>
              <Input
                id="bitpanda-label"
                placeholder="e.g. My Bitpanda"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                disabled={isLoading}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading} className="gap-2">
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isLoading ? "Connecting…" : "Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default BitpandaConnectButton;
