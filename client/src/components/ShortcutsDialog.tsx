import { useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GROUPS: Array<{
  title: string;
  items: Array<{ keys: string[]; label: string }>;
}> = [
  {
    title: 'Navigation',
    items: [
      { keys: ['Ctrl', 'K'], label: 'Open global search / command palette' },
      { keys: ['?'], label: 'Show this shortcut sheet' },
      { keys: ['Esc'], label: 'Close dialogs, menus, and drawers' },
    ],
  },
  {
    title: 'Boards',
    items: [
      { keys: ['N'], label: 'Add a new task to the first group' },
      { keys: ['/'], label: 'Focus the board search field' },
    ],
  },
  {
    title: 'Selection',
    items: [
      { keys: ['Shift', 'Click'], label: 'Select a range of tasks' },
      { keys: ['Delete'], label: 'Delete selected tasks' },
    ],
  },
];

function Key({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md bg-muted border border-border text-[11px] font-mono text-foreground shadow-sm">
      {children}
    </kbd>
  );
}

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Move around Project Management without leaving the keyboard.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                {g.title}
              </div>
              <ul className="space-y-1.5">
                {g.items.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between text-sm"
                  >
                    <span>{item.label}</span>
                    <span className="flex items-center gap-1">
                      {item.keys.map((k, ki) => (
                        <span key={ki} className="flex items-center gap-1">
                          <Key>{k}</Key>
                          {ki < item.keys.length - 1 && (
                            <span className="text-muted-foreground text-xs">+</span>
                          )}
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Binds `?` to open the shortcut sheet; ignores key presses from inputs. */
export function useShortcutSheetHotkey(onOpen: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== '?') return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        target.isContentEditable
      )
        return;
      e.preventDefault();
      onOpen();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onOpen]);
}
