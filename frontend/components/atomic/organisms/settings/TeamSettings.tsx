"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Check, Copy, Link2, Loader2, Plus, Users } from "lucide-react";

import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
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
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import { Switch } from "@/components/ui/shadcn/switch";
import type { Id } from "@/convex/_generated/dataModel";
import {
  useChangeTeamRole,
  useCreateTeam,
  useCreateTeamInvite,
  useDeleteTeam,
  useLeaveTeam,
  useMyPlan,
  useMyTeams,
  useRemoveTeamMember,
  useRenameTeam,
  useRevokeTeamInvite,
  useSetTeamSharing,
  useTeam,
} from "@/hooks/convex";
import { useErrorMessage } from "@/i18n/errors";
import {
  INVITE_ROLES,
  MAX_TEAM_NAME_LENGTH,
  canChangeRole,
  canGrantInviteRole,
  canInvite,
  canLeave,
  canManageTeam,
  canRemoveMember,
  invitePath,
  type InviteRole,
  type TeamRole,
} from "@/../services/teams/teams";

/** Runs a team action and reports a coded error through `onError`. */
function useRun(onError: (message: string | null) => void) {
  const errorMessage = useErrorMessage();
  return async (action: () => Promise<unknown>) => {
    onError(null);
    try {
      await action();
    } catch (err) {
      onError(errorMessage(err));
    }
  };
}

function Confirm({
  trigger,
  title,
  description,
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  onConfirm: () => void;
}) {
  const t = useTranslations("teams.confirm");
  const tActions = useTranslations("common.actions");
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tActions("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{t("confirm")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function InviteLinkDialog({ link, onClose }: { link: string | null; onClose: () => void }) {
  const t = useTranslations("teams.invite");
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open={link !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" /> {t("linkTitle")}
          </DialogTitle>
          <DialogDescription>{t("linkDescription")}</DialogDescription>
        </DialogHeader>
        {link && (
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={link}
              className="font-mono text-xs"
              autoComplete="off"
              spellCheck={false}
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={copied ? t("copied") : t("copy")}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                } catch {
                  // Clipboard blocked (permissions, insecure context): the
                  // read-only field stays selectable for a manual copy
                  return;
                }
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>{t("done")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeamCard({ teamId }: { teamId: Id<"teams"> }) {
  const t = useTranslations("teams");
  const tActions = useTranslations("common.actions");
  const format = useFormatter();
  const team = useTeam(teamId);
  const [error, setError] = useState<string | null>(null);
  const run = useRun(setError);
  const setSharing = useSetTeamSharing();
  const changeRole = useChangeTeamRole();
  const removeMember = useRemoveTeamMember();
  const leaveTeam = useLeaveTeam();
  const deleteTeam = useDeleteTeam();
  const renameTeam = useRenameTeam();
  const createInvite = useCreateTeamInvite();
  const revokeInvite = useRevokeTeamInvite();
  const [inviteRole, setInviteRole] = useState<InviteRole>("member");
  const [inviting, setInviting] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [rename, setRename] = useState<string | null>(null);

  if (team === undefined) {
    return <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />;
  }
  if (team === null) return null;

  const myRole: TeamRole = team.myRole;
  const date = (ms: number) => format.dateTime(new Date(ms), "date");
  const nameOf = (displayName: string | null) => displayName ?? t("team.unnamed");

  const handleInvite = () =>
    run(async () => {
      setInviting(true);
      try {
        const { token } = await createInvite({ teamId, role: inviteRole });
        setLink(`${window.location.origin}${invitePath(token)}`);
      } finally {
        setInviting(false);
      }
    });

  return (
    <Card>
      <CardHeader>
        {rename === null ? (
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> {team.team.name}
            <Badge variant="secondary">{t(`roles.${myRole}`)}</Badge>
          </CardTitle>
        ) : (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await renameTeam({ teamId, name: rename });
                setRename(null);
              });
            }}
          >
            <Input
              aria-label={t("create.name")}
              value={rename}
              maxLength={MAX_TEAM_NAME_LENGTH}
              onChange={(e) => setRename(e.target.value)}
            />
            <Button type="submit">{t("actions.save")}</Button>
            <Button type="button" variant="outline" onClick={() => setRename(null)}>
              {tActions("cancel")}
            </Button>
          </form>
        )}
        <CardDescription>{t("page.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {error && (
          <p className="border-destructive/50 text-destructive rounded-md border px-4 py-3 text-sm" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-start justify-between gap-4 rounded-md border p-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`share-${teamId}`}>{t("sharing.title")}</Label>
            <p className="text-muted-foreground text-sm">{t("sharing.description")}</p>
          </div>
          <Switch
            id={`share-${teamId}`}
            checked={team.mySharing}
            onCheckedChange={(sharing) => run(() => setSharing({ teamId, sharing }))}
          />
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{t("team.members")}</h3>
          <ul className="divide-y rounded-md border">
            {team.members.map((m) => {
              const name = nameOf(m.displayName);
              const roleChoices = (["admin", "member"] as const).filter((r) =>
                canChangeRole(myRole, m.role, r),
              );
              return (
                <li key={m.memberId} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                  <span className="font-medium">
                    {name}
                    {m.isMe && <span className="text-muted-foreground"> ({t("team.you")})</span>}
                  </span>
                  <Badge variant="outline">{t(`roles.${m.role}`)}</Badge>
                  <Badge variant={m.sharing ? "default" : "secondary"}>
                    {m.sharing ? t("team.sharing") : t("team.notSharing")}
                  </Badge>
                  <span className="text-muted-foreground">{t("team.joined", { date: date(m.joinedAt) })}</span>
                  <span className="ms-auto flex flex-wrap gap-2">
                    {roleChoices.length > 0 && m.role !== "owner" && (
                      <Select
                        value={m.role}
                        onValueChange={(role) =>
                          run(() => changeRole({ memberId: m.memberId, role: role as TeamRole }))
                        }
                      >
                        <SelectTrigger className="h-8 w-32" aria-label={t("actions.changeRole")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(["admin", "member"] as const).map((r) => (
                            <SelectItem key={r} value={r}>
                              {t(`roles.${r}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {canChangeRole(myRole, m.role, "owner") && (
                      <Confirm
                        trigger={<Button variant="outline" size="sm">{t("actions.makeOwner")}</Button>}
                        title={t("confirm.ownerTitle", { name })}
                        description={t("confirm.ownerDescription")}
                        onConfirm={() => run(() => changeRole({ memberId: m.memberId, role: "owner" }))}
                      />
                    )}
                    {!m.isMe && canRemoveMember(myRole, m.role) && (
                      <Confirm
                        trigger={<Button variant="outline" size="sm">{t("actions.remove")}</Button>}
                        title={t("confirm.removeTitle", { name })}
                        description={t("confirm.removeDescription")}
                        onConfirm={() => run(() => removeMember({ memberId: m.memberId }))}
                      />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {canInvite(myRole) && (
          <div className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-medium">{t("invite.title")}</h3>
              <p className="text-muted-foreground text-sm">{t("invite.description")}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex flex-col gap-2 sm:w-40">
                <Label htmlFor={`invite-role-${teamId}`}>{t("invite.role")}</Label>
                <Select value={inviteRole} onValueChange={(r) => setInviteRole(r as InviteRole)}>
                  <SelectTrigger id={`invite-role-${teamId}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INVITE_ROLES.filter((r) => canGrantInviteRole(myRole, r)).map((r) => (
                      <SelectItem key={r} value={r}>
                        {t(`roles.${r}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleInvite} disabled={inviting}>
                {inviting ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Link2 className="me-2 h-4 w-4" />}
                {t("invite.create")}
              </Button>
            </div>
            <div className="flex flex-col gap-1">
              <h4 className="text-muted-foreground text-xs font-medium uppercase">{t("invite.open")}</h4>
              {team.invites.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("invite.none")}</p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {team.invites.map((i) => (
                    <li key={i.inviteId} className="flex items-center gap-2 px-4 py-2 text-sm">
                      <Badge variant="outline">{t(`roles.${i.role}`)}</Badge>
                      <span className="text-muted-foreground">{t("invite.expires", { date: date(i.expiresAt) })}</span>
                      <Button
                        className="ms-auto"
                        variant="outline"
                        size="sm"
                        onClick={() => run(() => revokeInvite({ inviteId: i.inviteId }))}
                      >
                        {t("invite.revoke")}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap justify-end gap-2">
        {canLeave(myRole) && (
          <Confirm
            trigger={<Button variant="outline">{t("actions.leave")}</Button>}
            title={t("confirm.leaveTitle", { team: team.team.name })}
            description={t("confirm.leaveDescription")}
            onConfirm={() => run(() => leaveTeam({ teamId }))}
          />
        )}
        {canManageTeam(myRole) && (
          <>
            <Button variant="outline" onClick={() => setRename(team.team.name)}>
              {t("actions.rename")}
            </Button>
            <Confirm
              trigger={<Button variant="destructive">{t("actions.delete")}</Button>}
              title={t("confirm.deleteTitle", { team: team.team.name })}
              description={t("confirm.deleteDescription")}
              onConfirm={() => run(() => deleteTeam({ teamId }))}
            />
          </>
        )}
      </CardFooter>
      <InviteLinkDialog link={link} onClose={() => setLink(null)} />
    </Card>
  );
}

function CreateTeamCard() {
  const t = useTranslations("teams");
  const createTeam = useCreateTeam();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useRun(setError);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("create.title")}</CardTitle>
        <CardDescription>{t("create.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && (
          <p className="border-destructive/50 text-destructive rounded-md border px-4 py-3 text-sm" role="alert">
            {error}
          </p>
        )}
        <form
          className="flex flex-col gap-4 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              setBusy(true);
              try {
                await createTeam({ name });
                setName("");
              } finally {
                setBusy(false);
              }
            });
          }}
        >
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="team-name">{t("create.name")}</Label>
            <Input
              id="team-name"
              placeholder={t("create.namePlaceholder")}
              value={name}
              maxLength={MAX_TEAM_NAME_LENGTH}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Plus className="me-2 h-4 w-4" />}
            {t("create.submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Settings > Team: create a team (Pro), manage members, invites and sharing. */
export function TeamSettings() {
  const t = useTranslations("teams");
  const teams = useMyTeams();
  const plan = useMyPlan();

  return (
    <div className="flex flex-col gap-6">
      {plan === undefined ? null : plan?.plan === "pro" ? (
        <CreateTeamCard />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("proRequired.title")}</CardTitle>
            <CardDescription>{t("proRequired.description")}</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild>
              <Link href="/settings/billing">{t("proRequired.upgrade")}</Link>
            </Button>
          </CardFooter>
        </Card>
      )}
      {teams === undefined ? (
        <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
      ) : teams.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        teams.map((team) => <TeamCard key={team.teamId} teamId={team.teamId} />)
      )}
    </div>
  );
}
