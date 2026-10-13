import { useState } from 'react';
import { Column, ColumnOption, Task } from '@/data/types';
import { CellRenderer } from './CellRenderer';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  GripVertical,
  Maximize2,
  MessageCircle,
  MoreHorizontal,
  Copy,
  Trash2,
  ExternalLink,
} from 'lucide-react';

interface TaskRowProps {
  task: Task;
  columns: Column[];
  groupColor: string;
  groupId: string;
  updateCount?: number;
  onUpdate: (task: Task) => void;
  onOpenDetail?: (taskId: string, groupId: string) => void;
  onDelete?: (taskId: string, groupId: string) => void;
  onDuplicate?: (taskId: string, groupId: string) => void;
  onColumnOptionsChange?: (columnId: string, options: ColumnOption[]) => void;
  onDragStart: (e: React.DragEvent, taskId: string, groupId: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, targetGroupId: string) => void;
}

export function TaskRow({
  task,
  columns,
  groupColor,
  groupId,
  updateCount = 0,
  onUpdate,
  onOpenDetail,
  onDelete,
  onDuplicate,
  onColumnOptionsChange,
  onDragStart,
  onDragOver,
  onDrop,
}: TaskRowProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(task.name);

  const handleNameSubmit = () => {
    setEditing(false);
    if (name.trim() && name !== task.name) {
      onUpdate({ ...task, name: name.trim() });
    } else {
      setName(task.name);
    }
  };

  return (
    <tr
      className="border-b border-border hover:bg-muted/30 group transition-colors"
      draggable
      onDragStart={(e) => onDragStart(e, task.id, groupId)}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, groupId)}
    >
      {/* Drag handle + Color indicator + checkbox */}
      <td className="w-12 pl-1 pr-0">
        <div className="flex items-center gap-0.5">
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50 opacity-0 group-hover:opacity-100 cursor-grab transition-opacity" />
          <div className="w-[5px] h-8 rounded-sm shrink-0" style={{ backgroundColor: groupColor }} />
          <Checkbox
            checked={task.selected}
            onCheckedChange={(checked) => onUpdate({ ...task, selected: !!checked })}
            className="ml-2"
          />
        </div>
      </td>

      {/* Task name (always first, non-removable) + expand + comment-count */}
      <td className="px-3 py-2 min-w-[260px]">
        <div className="flex items-center gap-2 group/name">
          {editing ? (
            <input
              autoFocus
              className="w-full bg-background border border-primary rounded px-2 py-1 text-sm outline-none"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameSubmit}
              onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
            />
          ) : (
            <>
              <span
                className="text-sm cursor-pointer hover:text-primary transition-colors flex-1 truncate"
                onClick={() => setEditing(true)}
                title="Click to rename"
              >
                {task.name}
              </span>

              {onOpenDetail && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDetail(task.id, groupId);
                    }}
                    className="text-muted-foreground hover:text-primary p-1 rounded hover:bg-muted transition-colors shrink-0"
                    title="Open task details"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Comment bubble with count badge */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDetail(task.id, groupId);
                    }}
                    className="relative p-1 rounded transition-colors shrink-0 text-muted-foreground hover:text-primary hover:bg-muted"
                    title={updateCount > 0 ? `${updateCount} update${updateCount === 1 ? '' : 's'}` : 'Open updates'}
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    {updateCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 bg-status-orange text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                        {updateCount > 9 ? '9+' : updateCount}
                      </span>
                    )}
                  </button>
                </>
              )}

              {/* Row actions menu (Open / Duplicate / Delete) */}
              {(onDelete || onDuplicate || onOpenDetail) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted transition-colors shrink-0"
                      title="Task actions"
                      aria-label="Task actions"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    {onOpenDetail && (
                      <DropdownMenuItem
                        onSelect={() => onOpenDetail(task.id, groupId)}
                        className="text-xs gap-2"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open
                      </DropdownMenuItem>
                    )}
                    {onDuplicate && (
                      <DropdownMenuItem
                        onSelect={() => onDuplicate(task.id, groupId)}
                        className="text-xs gap-2"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Duplicate
                      </DropdownMenuItem>
                    )}
                    {onDelete && (
                      <>
                        {(onOpenDetail || onDuplicate) && <DropdownMenuSeparator />}
                        <DropdownMenuItem
                          onSelect={() => onDelete(task.id, groupId)}
                          className="text-xs gap-2 text-destructive focus:text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete task
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          )}
        </div>
      </td>

      {/* Dynamic columns */}
      {columns.map((column) => (
        <td key={column.id} className="px-3 py-2">
          <CellRenderer
            column={column}
            task={task}
            onChange={onUpdate}
            onColumnOptionsChange={onColumnOptionsChange}
          />
        </td>
      ))}

      {/* Spacer for the "+" add-column slot */}
      <td className="w-10" />
    </tr>
  );
}
