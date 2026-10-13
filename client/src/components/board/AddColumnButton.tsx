import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus } from 'lucide-react';
import {
  ColumnType,
  BUILT_IN_COLUMN_TYPES,
  CUSTOM_COLUMN_TYPES,
  COLUMN_TYPE_LABELS,
} from '@/data/types';
import { COLUMN_ICONS } from './ColumnHeader';

interface AddColumnButtonProps {
  /** Built-in types already in use; they won't be offered again. */
  usedBuiltInTypes: ColumnType[];
  onAdd: (type: ColumnType) => void;
}

export function AddColumnButton({ usedBuiltInTypes, onAdd }: AddColumnButtonProps) {
  const [open, setOpen] = useState(false);

  const availableBuiltIns = BUILT_IN_COLUMN_TYPES.filter(
    (t) => !usedBuiltInTypes.includes(t)
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted-foreground/10 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Add column"
          title="Add column"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">Add column</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {availableBuiltIns.length > 0 && (
          <>
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Built-in
            </DropdownMenuLabel>
            {availableBuiltIns.map((type) => {
              const Icon = COLUMN_ICONS[type];
              return (
                <DropdownMenuItem
                  key={type}
                  onSelect={() => {
                    onAdd(type);
                    setOpen(false);
                  }}
                  className="text-xs gap-2"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {COLUMN_TYPE_LABELS[type]}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Custom
        </DropdownMenuLabel>
        {CUSTOM_COLUMN_TYPES.map((type) => {
          const Icon = COLUMN_ICONS[type];
          return (
            <DropdownMenuItem
              key={type}
              onSelect={() => {
                onAdd(type);
                setOpen(false);
              }}
              className="text-xs gap-2"
            >
              <Icon className="w-3.5 h-3.5" />
              {COLUMN_TYPE_LABELS[type]}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
