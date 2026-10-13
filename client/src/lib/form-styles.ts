/**
 * Shared "premium" input + primary-button classNames used across auth
 * and admin surfaces. Consolidated here so the Login page, Create/Edit
 * user dialogs, and Admin toolbar stay visually consistent.
 */

export const premiumInputClass =
  'h-12 rounded-xl border-slate-200 bg-slate-50/50 px-4 text-[15px] shadow-sm ' +
  'transition-all duration-200 ' +
  'hover:border-slate-300 ' +
  'focus-visible:ring-primary/20 focus-visible:ring-[3px] focus-visible:border-primary focus-visible:bg-white';

export const premiumPrimaryButtonClass =
  'group h-12 px-6 rounded-xl text-[15px] font-semibold text-white ' +
  'bg-brand-gradient hover:brightness-105 ' +
  'shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 ' +
  'hover:-translate-y-0.5 active:translate-y-0 ' +
  'transition-all duration-200';
