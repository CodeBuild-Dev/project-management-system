import { z } from 'zod';

export const visibilityEnum = z.enum(['public', 'private']);
// status & priority are option ids drawn from the board's column config,
// so the server validates them as bounded strings rather than enums.
export const optionId = z.string().trim().min(1).max(64);

/** Accepts either an ISO string or Date; server stores as Date. Null clears the field. */
export const nullableDate = z
  .union([z.string().datetime(), z.date()])
  .nullable()
  .transform((v) => (v === null ? null : v instanceof Date ? v : new Date(v)));

export const nullableDateOptional = nullableDate.optional();
