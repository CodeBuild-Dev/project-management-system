import { useEffect, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import {
  ColumnOption,
  FALLBACK_OPTION,
  OPTION_COLOR_PALETTE,
} from '@/data/types';
import { Pencil, Plus, Trash2, Check, X } from 'lucide-react';

interface OptionBadgeProps {
  /** Currently selected option id (matches one of `options[*].id`). */
  value: string;
  /** Authoritative list of options for this column. */
  options: ColumnOption[];
  /** Min width (px) of the badge — keeps the layout stable per column. */
  minWidth?: number;
  /** Called when the user picks an option. */
  onChange: (value: string) => void;
  /**
   * Called when the user edits the option list (rename / add / remove / recolour).
   * Pass-through means the column owner persists the new array.
   */
  onOptionsChange?: (next: ColumnOption[]) => void;
}

/**
 * Editable status / priority pill. Click to open a picker that lets the user
 *   - select an existing option,
 *   - rename or recolour any option (pencil),
 *   - delete an option (trash) — orphan tasks fall back to a muted "(removed)" pill,
 *   - add a new option from the bottom row.
 *
 * Edits propagate to the parent via `onOptionsChange`. The component is
 * controlled — it never holds the canonical option array.
 */
export function OptionBadge({
  value,
  options,
  minWidth = 110,
  onChange,
  onOptionsChange,
}: OptionBadgeProps) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const selected = options.find((o) => o.id === value) ?? FALLBACK_OPTION;
  const canEdit = !!onOptionsChange;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`${selected.color} text-white px-3 py-1 rounded text-xs font-medium text-center hover:opacity-90 transition-opacity`}
          style={{ minWidth }}
        >
          {selected.label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1.5" align="start">
        <div className="space-y-0.5">
          {options.map((opt) => (
            <OptionRow
              key={opt.id}
              option={opt}
              isSelected={opt.id === value}
              isEditing={editingId === opt.id}
              canEdit={canEdit}
              onPick={() => {
                if (editingId) return;
                onChange(opt.id);
                setOpen(false);
              }}
              onStartEdit={() => setEditingId(opt.id)}
              onCancelEdit={() => setEditingId(null)}
              onSave={(next) => {
                if (!onOptionsChange) return;
                onOptionsChange(
                  options.map((o) => (o.id === opt.id ? { ...o, ...next } : o))
                );
                setEditingId(null);
              }}
              onDelete={() => {
                if (!onOptionsChange || options.length <= 1) return;
                onOptionsChange(options.filter((o) => o.id !== opt.id));
                setEditingId(null);
              }}
            />
          ))}
        </div>

        {canEdit && (
          <div className="border-t border-border mt-1.5 pt-1.5">
            <AddOptionRow
              existingIds={options.map((o) => o.id)}
              onAdd={(opt) => {
                if (!onOptionsChange) return;
                onOptionsChange([...options, opt]);
              }}
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ---------- existing-row sub-component ----------

function OptionRow({
  option,
  isSelected,
  isEditing,
  canEdit,
  onPick,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: {
  option: ColumnOption;
  isSelected: boolean;
  isEditing: boolean;
  canEdit: boolean;
  onPick: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (patch: { label: string; color: string }) => void;
  onDelete: () => void;
}) {
  const [draftLabel, setDraftLabel] = useState(option.label);
  const [draftColor, setDraftColor] = useState(option.color);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      setDraftLabel(option.label);
      setDraftColor(option.color);
      // Focus the input on next tick so the popover finishes layout first.
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [isEditing, option.label, option.color]);

  if (isEditing) {
    const trimmed = draftLabel.trim();
    const canSave = trimmed.length > 0 && trimmed.length <= 64;
    return (
      <div className="rounded-md bg-muted/40 p-1.5 space-y-1.5">
        <Input
          ref={inputRef}
          value={draftLabel}
          maxLength={64}
          onChange={(e) => setDraftLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSave) onSave({ label: trimmed, color: draftColor });
            if (e.key === 'Escape') onCancelEdit();
          }}
          className="h-7 text-xs"
          aria-label="Option label"
        />
        <div className="flex items-center gap-1 flex-wrap">
          {OPTION_COLOR_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setDraftColor(c)}
              className={`${c} w-5 h-5 rounded ${
                c === draftColor ? 'ring-2 ring-foreground/60 ring-offset-1' : ''
              }`}
              aria-label={`Pick color ${c}`}
            />
          ))}
        </div>
        <div className="flex justify-end gap-1">
          <button
            type="button"
            onClick={onCancelEdit}
            className="p-1 text-muted-foreground hover:text-foreground rounded"
            title="Cancel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1 text-destructive/80 hover:text-destructive hover:bg-destructive/10 rounded"
            title="Delete option"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => canSave && onSave({ label: trimmed, color: draftColor })}
            disabled={!canSave}
            className="p-1 text-primary hover:bg-primary/10 disabled:opacity-40 rounded"
            title="Save"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-2 px-2 py-1.5 hover:bg-muted/60 rounded-sm">
      <button
        type="button"
        onClick={onPick}
        className="flex-1 flex items-center gap-2 text-left text-xs"
      >
        <span className={`${option.color} w-3 h-3 rounded-sm shrink-0`} />
        <span className={isSelected ? 'font-medium' : ''}>{option.label}</span>
      </button>
      {canEdit && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onStartEdit();
          }}
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 text-muted-foreground hover:text-foreground rounded"
          title="Edit option"
          aria-label={`Edit option ${option.label}`}
        >
          <Pencil className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// ---------- add-option row ----------

function AddOptionRow({
  existingIds,
  onAdd,
}: {
  existingIds: string[];
  onAdd: (opt: ColumnOption) => void;
}) {
  const [active, setActive] = useState(false);
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(OPTION_COLOR_PALETTE[0]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (active) {
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setLabel('');
      setColor(OPTION_COLOR_PALETTE[0]);
    }
  }, [active]);

  const trimmed = label.trim();
  const canCommit = trimmed.length > 0 && trimmed.length <= 64;

  const commit = () => {
    if (!canCommit) return;
    onAdd({
      id: makeOptionId(trimmed, existingIds),
      label: trimmed,
      color,
    });
    setActive(false);
  };

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => setActive(true)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-primary hover:bg-primary/5 rounded-sm"
      >
        <Plus className="w-3.5 h-3.5" />
        Add option
      </button>
    );
  }

  return (
    <div className="rounded-md bg-muted/40 p-1.5 space-y-1.5">
      <Input
        ref={inputRef}
        value={label}
        placeholder="New option label"
        maxLength={64}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setActive(false);
        }}
        className="h-7 text-xs"
      />
      <div className="flex items-center gap-1 flex-wrap">
        {OPTION_COLOR_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={`${c} w-5 h-5 rounded ${
              c === color ? 'ring-2 ring-foreground/60 ring-offset-1' : ''
            }`}
            aria-label={`Pick color ${c}`}
          />
        ))}
      </div>
      <div className="flex justify-end gap-1">
        <button
          type="button"
          onClick={() => setActive(false)}
          className="p-1 text-muted-foreground hover:text-foreground rounded"
          title="Cancel"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={commit}
          disabled={!canCommit}
          className="p-1 text-primary hover:bg-primary/10 disabled:opacity-40 rounded"
          title="Save"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/**
 * Convert a free-text label into a stable, slug-ish id that's unique within
 * the column. Falls back to a counter suffix on collision.
 */
function makeOptionId(label: string, existing: string[]): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  const seed = base || 'option';
  if (!existing.includes(seed)) return seed;
  let n = 2;
  while (existing.includes(`${seed}-${n}`)) n += 1;
  return `${seed}-${n}`;
}
