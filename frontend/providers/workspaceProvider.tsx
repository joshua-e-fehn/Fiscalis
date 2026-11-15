"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { useMyTeams } from "@/hooks/convex/teams";

/**
 * The workspace the app reads from (ENG-197, docs/adr/0002-teams.md):
 * "Personal" (null) or one of the user's teams, whose views are the
 * read-only aggregate of its sharing members (convex/teamViews.ts). The
 * choice is remembered per browser and falls back to Personal when the
 * team is gone or the user left it.
 */

const STORAGE_KEY = "fiscalis.workspace";

type MyTeam = NonNullable<ReturnType<typeof useMyTeams>>[number];

interface WorkspaceContextValue {
  /** The selected team, or null for Personal */
  team: MyTeam | null;
  teams: MyTeam[];
  /**
   * A team is remembered but the user's teams have not loaded yet: data
   * hooks wait instead of briefly showing Personal numbers.
   */
  pending: boolean;
  select: (teamId: Id<"teams"> | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  team: null,
  teams: [],
  pending: false,
  select: () => {},
});

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(teamId: string | null) {
  try {
    if (teamId) window.localStorage.setItem(STORAGE_KEY, teamId);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the choice lasts for this page only
  }
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const myTeams = useMyTeams();
  // Read lazily on the client; the server render is always Personal
  const [selected, setSelected] = useState<string | null>(() =>
    typeof window === "undefined" ? null : readStored(),
  );

  const select = useCallback((teamId: Id<"teams"> | null) => {
    setSelected(teamId);
    writeStored(teamId);
  }, []);

  const value = useMemo<WorkspaceContextValue>(() => {
    const teams = myTeams ?? [];
    // Unknown until the teams load; a stale id reads as Personal
    const team = teams.find((t) => t.teamId === selected) ?? null;
    const pending = selected !== null && myTeams === undefined;
    return { team, teams, pending, select };
  }, [myTeams, selected, select]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

/** The current workspace: `team` is null in Personal. */
export function useWorkspace(): WorkspaceContextValue {
  return useContext(WorkspaceContext);
}

/**
 * The selected team's id, or null in Personal (for query arguments), and
 * whether a remembered team is still resolving.
 */
export function useWorkspaceTarget(): { teamId: Id<"teams"> | null; pending: boolean } {
  const { team, pending } = useWorkspace();
  return { teamId: team?.teamId ?? null, pending };
}
