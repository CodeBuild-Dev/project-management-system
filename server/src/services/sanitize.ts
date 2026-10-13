/**
 * Strip server-only / sensitive fields before persisting to audit_logs or
 * sending over the wire. Centralised so a new sensitive column can't leak
 * by being added to the schema and forgotten in N call sites.
 */

const USER_SENSITIVE_FIELDS = new Set([
  'passwordHash',
  'password_hash',
  'totpSecret',
  'totp_secret',
  'backupCodesHash',
  'backup_codes_hash',
]);

export function redactUserFields<T extends Record<string, unknown>>(
  row: T | null | undefined
): Record<string, unknown> | null {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (USER_SENSITIVE_FIELDS.has(k)) continue;
    out[k] = v;
  }
  return out;
}
