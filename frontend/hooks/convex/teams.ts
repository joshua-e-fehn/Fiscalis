import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Teams (ENG-197, docs/adr/0002-teams.md): membership, invites and opt-in
 * sharing. The team aggregate reads live in teamViews.ts.
 */

/** The signed-in user's teams with their role (the workspace switcher). */
export function useMyTeams() {
  return useQuery(api.teams.listMyTeams);
}

/** One team for Settings > Team; null for a non-member. */
export function useTeam(teamId: Id<"teams"> | null) {
  return useQuery(api.teams.getTeam, teamId ? { teamId } : "skip");
}

/** What an invite link joins; null when the link is not usable. */
export function useInvitePreview(token: string | null) {
  return useQuery(api.teams.previewInvite, token ? { token } : "skip");
}

export function useCreateTeam() {
  return useMutation(api.teams.createTeam);
}

export function useRenameTeam() {
  return useMutation(api.teams.renameTeam);
}

export function useDeleteTeam() {
  return useMutation(api.teams.deleteTeam);
}

export function useSetTeamSharing() {
  return useMutation(api.teams.setSharing);
}

export function useLeaveTeam() {
  return useMutation(api.teams.leaveTeam);
}

export function useRemoveTeamMember() {
  return useMutation(api.teams.removeMember);
}

export function useChangeTeamRole() {
  return useMutation(api.teams.changeRole);
}

/** Creates an invite link; the returned token is shown once. */
export function useCreateTeamInvite() {
  return useAction(api.teams.createInvite);
}

export function useRevokeTeamInvite() {
  return useMutation(api.teams.revokeInvite);
}

export function useAcceptTeamInvite() {
  return useMutation(api.teams.acceptInvite);
}
