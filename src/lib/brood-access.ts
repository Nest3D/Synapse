import type { FieldAccessMode } from "@prisma/client";

/** A selectable user in the access UI. */
export type UserOpt = { id: string; label: string };

/** One column's access rule, as shown in the member grid. */
export type AccessField = {
  id: string;
  label: string;
  type: string;
  accessMode: FieldAccessMode;
  userIds: string[];
};

/** A shared brood with its membership list and column rules. */
export type AccessBrood = {
  id: string;
  name: string;
  members: string[];
  fields: AccessField[];
};

/**
 * Whether a brood member sees a column, given its rule. This is the non-admin
 * half of `fieldVisible` — the membership gate is checked separately.
 */
export function memberSeesColumn(
  mode: FieldAccessMode,
  userIds: string[],
  userId: string,
): boolean {
  if (mode === "ALL") return true;
  const inList = userIds.includes(userId);
  return mode === "INCLUDE" ? inList : !inList;
}

/**
 * New (mode, userIds) so that `userId`'s effective visibility becomes `canView`,
 * auto-converting modes:
 *  - ALL + hide   -> EXCLUDE [userId]   (everyone else still sees it)
 *  - INCLUDE      -> add / remove userId
 *  - EXCLUDE      -> remove / add userId; an empty EXCLUDE list reverts to ALL
 */
export function applyMemberColumnAccess(
  mode: FieldAccessMode,
  userIds: string[],
  userId: string,
  canView: boolean,
): { mode: FieldAccessMode; userIds: string[] } {
  const without = userIds.filter((id) => id !== userId);
  switch (mode) {
    case "ALL":
      return canView
        ? { mode: "ALL", userIds: [] }
        : { mode: "EXCLUDE", userIds: [userId] };
    case "INCLUDE":
      return canView
        ? { mode: "INCLUDE", userIds: [...without, userId] }
        : { mode: "INCLUDE", userIds: without };
    case "EXCLUDE": {
      const next = canView ? without : [...without, userId];
      return next.length === 0
        ? { mode: "ALL", userIds: [] }
        : { mode: "EXCLUDE", userIds: next };
    }
    default:
      return { mode, userIds };
  }
}
