"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import { PageHeader } from "@/components/atomic/molecules/investments/PageHeader";
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent, CardFooter } from "@/components/ui/shadcn/card";
import { useAcceptTeamInvite, useInvitePreview } from "@/hooks/convex";
import { useErrorMessage } from "@/i18n/errors";
import { inviteTokenFromHash } from "@/../services/teams/teams";

/**
 * The invite link's landing page (/settings/team/join#fti_…). The token is
 * read from the URL fragment, which the browser never sends to a server.
 */
export default function JoinTeamPage() {
  const t = useTranslations("teams");
  const errorMessage = useErrorMessage();
  // undefined until the fragment is read on the client
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const preview = useInvitePreview(token ?? null);
  const accept = useAcceptTeamInvite();
  const [joined, setJoined] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Read once, then drop it from the address bar and history
    const read = inviteTokenFromHash(window.location.hash);
    window.history.replaceState(null, "", window.location.pathname);
    setToken(read);
  }, []);

  const loading = token === undefined || (token !== null && preview === undefined);

  let body: React.ReactNode;
  if (joined) {
    body = <p>{t("join.joined", { team: joined })}</p>;
  } else if (loading) {
    body = (
      <p className="text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("join.loading")}
      </p>
    );
  } else if (!token || !preview) {
    body = <p>{t("join.invalid")}</p>;
  } else if (preview.alreadyMember) {
    body = <p>{t("join.alreadyMember", { team: preview.teamName })}</p>;
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <p>{t("join.prompt", { team: preview.teamName, role: t(`roles.${preview.role}`) })}</p>
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
        <Button
          className="self-start"
          disabled={busy}
          onClick={async () => {
            setError(null);
            setBusy(true);
            try {
              await accept({ token });
              setJoined(preview.teamName);
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
          {t("join.accept")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader title={t("join.title")} subtitle={t("page.subtitle")} />
      <Card>
        <CardContent className="pt-6">{body}</CardContent>
        <CardFooter>
          <Button variant="outline" asChild>
            <Link href="/settings/team">{t("join.goToTeam")}</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
