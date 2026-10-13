import { useState } from 'react';
import { TaskGroup, Task, Column, ColumnType, ColumnOption } from '@/data/types';
import { TaskRow } from './TaskRow';
import { ColumnHeader } from './ColumnHeader';
import { AddColumnButton } from './AddColumnButton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, ChevronRight, Plus, MoreHorizontal, Pencil, Trash2, GripVertical } from 'lucide-react';

interface GroupSectionProps {
  group: TaskGroup;
  columns: Column[];
  updateCountByTaskId?: Record<string, number>;
  onUpdateTask: (groupId: string, task: Task) => void;
  onAddTask: (groupId: string) => void;
  onToggleCollapse: (groupId: string) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  onDeleteTask?: (taskId: string, groupId: string) => void;
  onDuplicateTask?: (taskId: string, groupId: string) => void;
  onOpenDetail?: (taskId: string, groupId: string) => void;
  onDragStart: (e: React.DragEvent, taskId: string, groupId: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, targetGroupId: string) => void;
  /** Optional — omit to disable dragging this group for reordering. */
  onGroupDragStart?: (e: React.DragEvent, groupId: string) => void;
  onGroupDragEnd?: () => void;
  /** True while this group is the one being dragged (visual cue). */
  isDragging?: boolean;
  // Column management (board-level, but surfaced through the group header row)
  onAddColumn: (type: ColumnType) => void;
  onRenameColumn: (columnId: string, newName: string) => void;
  onDeleteColumn: (columnId: string) => void;
  onMoveColumn: (columnId: string, direction: 'left' | 'right') => void;
  /** Persists per-column option list edits (status / priority pickers). */
  onColumnOptionsChange?: (columnId: string, options: ColumnOption[]) => void;
}

export function GroupSection({
  group,
  columns,
  updateCountByTaskId,
  onUpdateTask,
  onAddTask,
  onToggleCollapse,
  onRenameGroup,
  onDeleteGroup,
  onDeleteTask,
  onDuplicateTask,
  onOpenDetail,
  onDragStart,
  onDragOver,
  onDrop,
  onGroupDragStart,
  onGroupDragEnd,
  isDragging = false,
  onAddColumn,
  onRenameColumn,
  onDeleteColumn,
  onMoveColumn,
  onColumnOptionsChange,
}: GroupSectionProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [dragOver, setDragOver] = useState(false);

  const handleNameSubmit = () => {
    setEditing(false);
    if (name.trim() && name !== group.name) {
      onRenameGroup(group.id, name.trim());
    } else {
      setName(group.name);
    }
  };

  const usedBuiltInTypes = columns.map((c) => c.type);

  return (
    <div
      className={`mb-6 rounded-lg transition-all ${
        dragOver ? 'bg-primary/5 ring-2 ring-primary/20' : ''
      } ${isDragging ? 'opacity-40' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
        onDragOver(e);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false);
        onDrop(e, group.id);
      }}
    >
      {/* Group header */}
      <div className="group/group-header flex items-center gap-2 mb-1 px-1">
        {onGroupDragStart && (
          <span
            draggable
            onDragStart={(e) => onGroupDragStart(e, group.id)}
            onDragEnd={onGroupDragEnd}
            className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground opacity-0 group-hover/group-header:opacity-100 transition-opacity"
            title="Drag to reorder group"
            aria-label="Drag group"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </span>
        )}
        <button onClick={() => onToggleCollapse(group.id)} className="hover:bg-muted rounded p-0.5 transition-colors">
          {group.collapsed ? (
            <ChevronRight className="w-4 h-4" style={{ color: group.color }} />
          ) : (
            <ChevronDown className="w-4 h-4" style={{ color: group.color }} />
          )}
        </button>
        {editing ? (
          <input
            autoFocus
            className="text-sm font-bold border border-primary rounded px-2 py-0.5 bg-background outline-none"
            style={{ color: group.color }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
          />
        ) : (
          <span
            className="text-sm font-bold cursor-pointer"
            style={{ color: group.color }}
            onClick={() => setEditing(true)}
          >
            {group.name}
          </span>
        )}
        <span className="text-xs text-muted-foreground">{group.tasks.length} items</span>

        {/* Group actions menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="opacity-0 group-hover/group-header:opacity-100 text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted transition-all"
              title="Group actions"
              aria-label="Group actions"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuItem
              onSelect={() => setEditing(true)}
              className="text-xs gap-2"
            >
              <Pencil className="w-3.5 h-3.5" />
              Rename group
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onAddTask(group.id)}
              className="text-xs gap-2"
            >
              <Plus className="w-3.5 h-3.5" />
              Add task
            </DropdownMenuItem>
            {onDeleteGroup && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => onDeleteGroup(group.id)}
                  className="text-xs gap-2 text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete group
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {!group.collapsed && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="w-12" />
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground min-w-[220px]">
                    Task
                  </th>
                  {columns.map((col, i) => (
                    <th key={col.id} className="px-3 py-2 text-left min-w-[110px]">
                      <ColumnHeader
                        column={col}
                        canMoveLeft={i > 0}
                        canMoveRight={i < columns.length - 1}
                        onRename={(n) => onRenameColumn(col.id, n)}
                        onDelete={() => onDeleteColumn(col.id)}
                        onMoveLeft={() => onMoveColumn(col.id, 'left')}
                        onMoveRight={() => onMoveColumn(col.id, 'right')}
                      />
                    </th>
                  ))}
                  <th className="px-2 py-2 text-left w-10">
                    <AddColumnButton usedBuiltInTypes={usedBuiltInTypes} onAdd={onAddColumn} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {group.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    columns={columns}
                    groupColor={group.color}
                    groupId={group.id}
                    updateCount={updateCountByTaskId?.[task.id] ?? 0}
                    onUpdate={(updated) => onUpdateTask(group.id, updated)}
                    onOpenDetail={onOpenDetail}
                    onDelete={onDeleteTask}
                    onDuplicate={onDuplicateTask}
                    onColumnOptionsChange={onColumnOptionsChange}
                    onDragStart={onDragStart}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={() => onAddTask(group.id)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary px-6 py-2 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add item
          </button>
        </>
      )}
    </div>
  );
}
