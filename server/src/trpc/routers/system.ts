import { z } from 'zod';
import { router, dbProcedure } from '../trpc.js';
import { authedDbProcedure } from '../procedures.js';
import { makeActor } from '../actor.js';
import { requirePermission } from '../../services/permissions.js';
import { writeAuditLog } from '../../services/audit.js';
import {
  getSystemSetting,
  setSystemSetting,
} from '../../services/system-settings.js';

/**
 * Closed allowlist. Only palette ids the client knows about can be saved
 * — even a Super Admin can't write arbitrary strings into this row.
 */
const PALETTE_IDS = [
  'sunset',
  'ocean',
  'forest',
  'royal',
  'midnight',
  'sunrise',
  'crimson',
  'mint',
  'cosmic',
  'mocha',
] as const;
const paletteSchema = z.enum(PALETTE_IDS);

export const systemRouter = router({
  /**
   * Returns the current org-wide brand palette. Public so the login /
   * accept-invite pages render with the right colours before the user is
   * authenticated. `null` means no admin has set one yet → client uses the
   * built-in default ('sunset').
   */
  getBrandPalette: dbProcedure.query(async ({ ctx }) => {
    const value = await getSystemSetting(ctx.db, 'brand_palette');
    if (!value) return { palette: null as null };
    // Defensive: if the stored value somehow isn't in the allowlist
    // (e.g. an old palette id we removed), fall back to null so the
    // client uses its default.
    const parsed = paletteSchema.safeParse(value);
    return { palette: parsed.success ? parsed.data : null };
  }),

  /**
   * Persist the org-wide brand palette. Gated by `settings.manage`, which
   * by default is owner + super_admin only — admins can't repaint the org.
   */
  setBrandPalette: authedDbProcedure
    .input(z.object({ palette: paletteSchema }))
    .mutation(async ({ ctx, input }) => {
      const actor = makeActor(ctx.user, ctx);
      requirePermission(actor, 'settings', 'manage');
      const previous = await getSystemSetting(ctx.db, 'brand_palette');
      await setSystemSetting(
        ctx.db,
        'brand_palette',
        input.palette,
        ctx.user.id
      );
      await writeAuditLog(ctx.db, actor, {
        action: 'system.setting.update',
        entityType: 'system_setting',
        entityId: 'brand_palette',
        previousValue: { palette: previous },
        newValue: { palette: input.palette },
      });
      return { palette: input.palette };
    }),
});
