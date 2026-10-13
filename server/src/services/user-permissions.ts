import type { PermissionOverrides } from '@projectmgmt/shared';
import { EMPTY_PERMISSION_OVERRIDES } from '@projectmgmt/shared';
import { isValidPermissionKey } from './permissions-registry.js';

/**
 * Defensive normaliser: turns whatever shape comes back from JSONB (or from
 * the wire) into a clean PermissionOverrides. Drops unknown keys, dedupes,
 * and strips entries that appear in both lists (denies wins, but emitting
 * both is a logical bug — silently fix it).
 */
export function sanitizeOverrides(value: unknown): PermissionOverrides {
  if (!value || typeof value !== 'object') return { ...EMPTY_PERMISSION_OVERRIDES };
  const v = value as { grants?: unknown; denies?: unknown };
  const grants = clean(v.grants);
  const denies = clean(v.denies);
  const denySet = new Set(denies);
  return {
    grants: grants.filter((k) => !denySet.has(k)),
    denies,
  };
}

function clean(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of input) {
    if (typeof item !== 'string') continue;
    if (!isValidPermissionKey(item)) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}
