import { LayoutGrid, CalendarDays, BarChart3, FileText } from 'lucide-react';

export type BoardViewKind = 'table' | 'calendar' | 'dashboard' | 'budget';

interface ViewSwitcherProps {
  value: BoardViewKind;
  onChange: (v: BoardViewKind) => void;
}

const views: { key: BoardViewKind; label: string; Icon: typeof LayoutGrid }[] = [
  { key: 'table', label: 'Main table', Icon: LayoutGrid },
  { key: 'calendar', label: 'Calendar', Icon: CalendarDays },
  { key: 'dashboard', label: 'Dashboard', Icon: BarChart3 },
  // The 'budget' kind is preserved so existing route state / URLs don't break;
  // the tab itself is rebranded as Project details. Budget + billing settings
  // live inside this tab, alongside the project metadata (title, description,
  // deadline, client, status).
  { key: 'budget', label: 'Project details', Icon: FileText },
];

/**
 * Tab-style view switcher. Underline indicator on the active tab.
 */
export function ViewSwitcher({ value, onChange }: ViewSwitcherProps) {
  return (
    <div className="flex items-end gap-1">
      {views.map(({ key, label, Icon }) => {
        const active = value === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
              active
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {active && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}
