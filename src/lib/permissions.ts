/**
 * Pure permission helpers — no DB, no framework. Unit-tested in permissions.test.ts.
 */

/** Resolve which field keys a user may VIEW in a tab. */
export function resolveVisibleFieldKeys(args: {
  allKeys: string[];
  grantedKeys: string[];
  isAdmin: boolean;
}): string[] {
  const { allKeys, grantedKeys, isAdmin } = args;
  if (isAdmin) return allKeys;
  if (grantedKeys.length === 0) return allKeys; // opt-in restriction
  const granted = new Set(grantedKeys);
  return allKeys.filter((k) => granted.has(k));
}

/** Whether an email may sign in: bootstrap admin, or an existing (invited) user. */
export function isLoginAllowed(args: {
  email: string | null | undefined;
  adminEmail: string | undefined;
  userExists: boolean;
}): boolean {
  const { email, adminEmail, userExists } = args;
  if (!email) return false;
  if (adminEmail && email.toLowerCase() === adminEmail.toLowerCase()) return true;
  return userExists;
}

/** Keep only visible keys from a task values object. */
export function stripValuesToVisible(
  values: Record<string, unknown>,
  visibleKeys: string[],
): Record<string, unknown> {
  const visible = new Set(visibleKeys);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (visible.has(k)) out[k] = v;
  }
  return out;
}
