import { Board, DEFAULT_BOARD_COLUMNS } from '@/data/types';
import {
  KanbanSquare,
  Rocket,
  Bug,
  Target,
  ListTodo,
  type LucideIcon,
} from 'lucide-react';

export interface BoardTemplate {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  /** Tailwind classes for the icon tile background + foreground colour. */
  tone: string;
  /** Seed data the wizard writes into the new board. */
  build: (idStamp: string) => {
    groups: Board['groups'];
    columns: Board['columns'];
  };
}

function makeGroups(
  idStamp: string,
  specs: Array<{ name: string; color: string }>
): Board['groups'] {
  return specs.map((s, i) => ({
    id: `g-${idStamp}-${i + 1}`,
    name: s.name,
    color: s.color,
    collapsed: false,
    tasks: [],
  }));
}

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    id: 'project-plan',
    name: 'Project Plan',
    description: 'Phased plan with Backlog, In Progress, Review, and Done.',
    icon: KanbanSquare,
    tone: 'bg-blue-100 text-blue-600',
    build: (idStamp) => ({
      groups: makeGroups(idStamp, [
        { name: 'Backlog', color: 'hsl(220 8% 56%)' },
        { name: 'In Progress', color: 'hsl(28 100% 58%)' },
        { name: 'Review', color: 'hsl(210 100% 56%)' },
        { name: 'Done', color: 'hsl(154 68% 45%)' },
      ]),
      columns: [...DEFAULT_BOARD_COLUMNS],
    }),
  },
  {
    id: 'sprint-board',
    name: 'Sprint Board',
    description: 'Classic sprint layout: Not started, Working, Stuck, Done.',
    icon: Rocket,
    tone: 'bg-orange-100 text-orange-600',
    build: (idStamp) => ({
      groups: makeGroups(idStamp, [
        { name: 'Not Started', color: 'hsl(220 8% 56%)' },
        { name: 'Working', color: 'hsl(28 100% 58%)' },
        { name: 'Stuck', color: 'hsl(0 72% 55%)' },
        { name: 'Done', color: 'hsl(154 68% 45%)' },
      ]),
      columns: [...DEFAULT_BOARD_COLUMNS],
    }),
  },
  {
    id: 'bug-tracker',
    name: 'Bug Tracker',
    description: 'Track incoming bugs from Triage to Resolved.',
    icon: Bug,
    tone: 'bg-red-100 text-red-600',
    build: (idStamp) => ({
      groups: makeGroups(idStamp, [
        { name: 'Triage', color: 'hsl(0 72% 55%)' },
        { name: 'Investigating', color: 'hsl(28 100% 58%)' },
        { name: 'Fixing', color: 'hsl(45 100% 55%)' },
        { name: 'Verifying', color: 'hsl(210 100% 56%)' },
        { name: 'Resolved', color: 'hsl(154 68% 45%)' },
      ]),
      columns: [...DEFAULT_BOARD_COLUMNS],
    }),
  },
  {
    id: 'okrs',
    name: 'OKRs',
    description: 'Objectives with Key Results grouped by progress.',
    icon: Target,
    tone: 'bg-purple-100 text-purple-600',
    build: (idStamp) => ({
      groups: makeGroups(idStamp, [
        { name: 'Objectives', color: 'hsl(280 60% 55%)' },
        { name: 'On Track', color: 'hsl(154 68% 45%)' },
        { name: 'At Risk', color: 'hsl(45 100% 55%)' },
        { name: 'Off Track', color: 'hsl(0 72% 55%)' },
      ]),
      columns: [...DEFAULT_BOARD_COLUMNS],
    }),
  },
  {
    id: 'simple',
    name: 'Simple Tasks',
    description: 'Minimal list with one group — add structure as you grow.',
    icon: ListTodo,
    tone: 'bg-emerald-100 text-emerald-600',
    build: (idStamp) => ({
      groups: makeGroups(idStamp, [
        { name: 'Tasks', color: 'hsl(340 82% 58%)' },
      ]),
      columns: [...DEFAULT_BOARD_COLUMNS],
    }),
  },
];
