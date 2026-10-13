import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Copy,
  Download,
  Archive,
  Trash2,
  ArrowRight,
  X,
  Flag,
  CircleDot,
  Sparkles,
} from 'lucide-react';
import { ColumnOption, TaskGroup } from '@/data/types';

interface SelectionToolbarProps {
  selectedCount: number;
  groups: TaskGroup[];
  /** Per-board status options for the bulk-status dropdown. */
  statusOptions: ColumnOption[];
  /** Per-board priority options for the bulk-priority dropdown. */
  priorityOptions: ColumnOption[];
  onDelete: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onArchive: () => void;
  onMoveTo: (targetGroupId: string) => void;
  onStatusChange: (status: string) => void;
  onPriorityChange: (priority: string) => void;
  onDeselectAll: () => void;
  onOpenBulkWizard: () => void;
}

export function SelectionToolbar({
  selectedCount,
  groups,
  statusOptions,
  priorityOptions,
  onDelete,
  onDuplicate,
  onExport,
  onArchive,
  onMoveTo,
  onStatusChange,
  onPriorityChange,
  onDeselectAll,
  onOpenBulkWizard,
}: SelectionToolbarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-card text-card-foreground border border-border rounded-2xl shadow-2xl pl-1 pr-2 py-1 flex items-center gap-0.5 animate-in slide-in-from-bottom-4">
      {/* Count badge */}
      <div className="flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-3 py-2">
        <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">
          {selectedCount}
        </div>
        <span className="text-xs font-medium whitespace-nowrap">
          {selectedCount === 1 ? 'Task selected' : 'Tasks selected'}
        </span>
      </div>

      <ToolbarButton icon={Copy} label="Duplicate" onClick={onDuplicate} />
      <ToolbarButton icon={Download} label="Export" onClick={onExport} />

      {/* Status */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-lg hover:bg-muted transition-colors">
            <CircleDot className="w-4 h-4 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Status</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" className="w-44">
          {statusOptions.map((s) => (
            <DropdownMenuItem
              key={s.id}
              onSelect={() => onStatusChange(s.id)}
              className="text-xs gap-2"
            >
              <span className={`w-3 h-3 rounded-sm ${s.color}`} />
              {s.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Priority */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-lg hover:bg-muted transition-colors">
            <Flag className="w-4 h-4 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Priority</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" className="w-40">
          {priorityOptions.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onSelect={() => onPriorityChange(p.id)}
              className="text-xs gap-2"
            >
              <span className={`w-3 h-3 rounded-sm ${p.color}`} />
              {p.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Move to */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Move to</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" className="w-52">
          {groups.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No groups</div>
          )}
          {groups.map((g) => (
            <DropdownMenuItem
              key={g.id}
              onSelect={() => onMoveTo(g.id)}
              className="text-xs gap-2"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: g.color }}
              />
              <span className="truncate">{g.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <ToolbarButton icon={Archive} label="Archive" onClick={onArchive} />
      <ToolbarButton
        icon={Trash2}
        label="Delete"
        onClick={onDelete}
        className="text-destructive hover:bg-destructive/10"
      />

      <div className="w-px h-8 bg-border mx-1" />

      <button
        onClick={onOpenBulkWizard}
        className="flex items-center gap-1.5 bg-brand-gradient text-white text-xs font-medium px-3 py-2 rounded-lg hover:brightness-105 shadow-sm shadow-primary/20 transition-all"
        title="Bulk update with more options"
      >
        <Sparkles className="w-3.5 h-3.5" />
        Update…
      </button>

      <div className="w-px h-8 bg-border mx-1" />

      <button
        onClick={onDeselectAll}
        className="p-2 rounded-lg hover:bg-muted transition-colors"
        title="Clear selection"
        aria-label="Clear selection"
      >
        <X className="w-4 h-4 text-muted-foreground" />
      </button>
    </div>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  className = '',
}: {
  icon: typeof Copy;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-lg hover:bg-muted transition-colors ${className}`}
      title={label}
    >
      <Icon className="w-4 h-4 text-muted-foreground" />
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </button>
  );
}
