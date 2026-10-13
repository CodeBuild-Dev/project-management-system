import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  User,
  CircleDot,
  Flag,
  CalendarDays,
  GanttChart,
  Tag,
  BarChart3,
  Type,
  Hash,
  SquareCheck,
  Star,
  MoreHorizontal,
  Pencil,
  Trash2,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import { Column, ColumnType } from '@/data/types';

const COLUMN_ICONS: Record<ColumnType, typeof User> = {
  person: User,
  status: CircleDot,
  priority: Flag,
  dueDate: CalendarDays,
  timeline: GanttChart,
  tags: Tag,
  progress: BarChart3,
  text: Type,
  number: Hash,
  date: CalendarDays,
  checkbox: SquareCheck,
  rating: Star,
};

interface ColumnHeaderProps {
  column: Column;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onRename: (newName: string) => void;
  onDelete: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
}

export function ColumnHeader({
  column,
  canMoveLeft,
  canMoveRight,
  onRename,
  onDelete,
  onMoveLeft,
  onMoveRight,
}: ColumnHeaderProps) {
  const Icon = COLUMN_ICONS[column.type];
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(column.name);

  const commit = () => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== column.name) onRename(trimmed);
    else setDraftName(column.name);
    setEditing(false);
  };

  if (editing) {
    return (
      <Input
        autoFocus
        value={draftName}
        onChange={(e) => setDraftName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') {
            setDraftName(column.name);
            setEditing(false);
          }
        }}
        className="h-6 text-xs px-1.5 min-w-[100px]"
      />
    );
  }

  return (
    <div className="group/col flex items-center gap-1 w-full">
      <Icon className="w-3 h-3 text-muted-foreground shrink-0" />
      <span className="text-xs font-medium text-muted-foreground truncate">{column.name}</span>
      <div className="flex-1" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="opacity-0 group-hover/col:opacity-100 hover:bg-muted-foreground/10 rounded p-0.5 transition-all"
            aria-label="Column options"
          >
            <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => setEditing(true)} className="text-xs">
            <Pencil className="w-3.5 h-3.5 mr-2" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canMoveLeft}
            onSelect={onMoveLeft}
            className="text-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-2" />
            Move left
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canMoveRight}
            onSelect={onMoveRight}
            className="text-xs"
          >
            <ArrowRight className="w-3.5 h-3.5 mr-2" />
            Move right
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onDelete} className="text-xs text-destructive focus:text-destructive">
            <Trash2 className="w-3.5 h-3.5 mr-2" />
            Delete column
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export { COLUMN_ICONS };
