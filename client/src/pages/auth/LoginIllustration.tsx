/**
 * Task-management-themed illustration for the Login page.
 * Composes stylized task cards, a checkmark bubble, a calendar chip,
 * and floating status dots over the page's pink → coral gradient panel.
 * Pure SVG / divs — no external assets.
 */
export function LoginIllustration() {
  return (
    <div className="relative w-full max-w-[420px] aspect-square">
      {/* Soft decorative blob behind the cards */}
      <div
        aria-hidden="true"
        className="absolute inset-10 rounded-[40%] bg-white/10 blur-2xl"
      />

      {/* Cloud — top left */}
      <svg
        aria-hidden="true"
        className="absolute -top-6 -left-4 w-24 opacity-80 animate-drift"
        viewBox="0 0 120 60"
        fill="none"
      >
        <path
          d="M25 50 C10 50 5 35 18 30 C15 15 35 10 42 22 C50 10 75 15 72 32 C90 30 95 50 78 50 Z"
          fill="white"
        />
      </svg>

      {/* Cloud — bottom right */}
      <svg
        aria-hidden="true"
        className="absolute -bottom-4 -right-2 w-28 opacity-90 animate-drift"
        style={{ animationDelay: '2s' }}
        viewBox="0 0 120 60"
        fill="none"
      >
        <path
          d="M25 50 C10 50 5 35 18 30 C15 15 35 10 42 22 C50 10 75 15 72 32 C90 30 95 50 78 50 Z"
          fill="white"
        />
      </svg>

      {/* Main board card — outer handles centering, inner handles float + rotate */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[78%]">
        <div
          className="bg-white rounded-2xl shadow-2xl p-4 animate-float-slow"
          style={{ ['--float-rotate' as string]: '-4deg' }}
        >
          {/* Board header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            </div>
            <span className="text-[10px] font-medium text-slate-400 tracking-wide uppercase">
              My Board
            </span>
          </div>

          {/* Task rows */}
          <TaskRow label="Design landing page" status="done" />
          <TaskRow label="Review sprint backlog" status="working" />
          <TaskRow label="Sync with product team" status="todo" />
          <TaskRow label="Ship v1.2 release" status="working" />

          {/* Progress bar */}
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full w-[62%] bg-brand-gradient rounded-full" />
            </div>
            <span className="text-[10px] font-semibold text-slate-500">62%</span>
          </div>
        </div>
      </div>

      {/* Floating checkmark bubble — top right */}
      <div
        className="absolute top-4 right-2 w-14 h-14 bg-white rounded-2xl shadow-xl flex items-center justify-center animate-float"
        style={{ ['--float-rotate' as string]: '6deg' }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="w-7 h-7"
          stroke="hsl(var(--brand-from))"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12l5 5L20 7" />
        </svg>
        <span className="absolute -bottom-1 left-3 w-3 h-3 bg-white rotate-45" />
      </div>

      {/* Floating calendar chip — bottom left */}
      <div
        className="absolute bottom-10 left-0 bg-white rounded-xl shadow-lg px-3 py-2 flex items-center gap-2 animate-float-delayed"
        style={{ ['--float-rotate' as string]: '-6deg' }}
      >
        <div className="w-8 h-8 rounded-lg bg-brand-gradient flex flex-col items-center justify-center text-white leading-none">
          <span className="text-[8px] font-semibold uppercase mt-0.5">Apr</span>
          <span className="text-[11px] font-bold">24</span>
        </div>
        <div className="leading-tight">
          <div className="text-[10px] font-semibold text-slate-700">Team sync</div>
          <div className="text-[9px] text-slate-400">10:00 AM</div>
        </div>
      </div>

      {/* Floating avatar stack — top left of card */}
      <div
        className="absolute top-10 left-2 bg-white rounded-full shadow-lg px-2.5 py-1.5 flex items-center gap-1 animate-float"
        style={{
          ['--float-rotate' as string]: '-8deg',
          animationDelay: '1.5s',
        }}
      >
        <Avatar bg="bg-rose-400" letter="A" />
        <Avatar bg="bg-violet-400" letter="M" />
        <Avatar bg="bg-emerald-400" letter="S" />
        <span className="text-[10px] font-semibold text-slate-500 ml-1">+4</span>
      </div>
    </div>
  );
}

function TaskRow({
  label,
  status,
}: {
  label: string;
  status: 'done' | 'working' | 'todo';
}) {
  const statusColor =
    status === 'done'
      ? 'bg-emerald-400'
      : status === 'working'
      ? 'bg-amber-400'
      : 'bg-slate-300';

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-slate-100 last:border-0">
      <span
        className={`w-4 h-4 rounded-full flex items-center justify-center flex-none ${
          status === 'done' ? 'bg-emerald-400' : 'border-2 border-slate-200'
        }`}
      >
        {status === 'done' && (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="w-2.5 h-2.5"
            stroke="white"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12l5 5L20 7" />
          </svg>
        )}
      </span>
      <span
        className={`text-[11px] flex-1 ${
          status === 'done'
            ? 'text-slate-400 line-through'
            : 'text-slate-700'
        }`}
      >
        {label}
      </span>
      <span className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
    </div>
  );
}

function Avatar({ bg, letter }: { bg: string; letter: string }) {
  return (
    <span
      className={`w-5 h-5 rounded-full ${bg} flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-white -ml-1 first:ml-0`}
    >
      {letter}
    </span>
  );
}
