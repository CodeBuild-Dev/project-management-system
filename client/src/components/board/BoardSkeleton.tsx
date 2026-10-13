import { Skeleton } from '@/components/ui/skeleton';

/**
 * Mirrors the rough shape of <BoardView /> so that the layout doesn't shift
 * when real data resolves. Used while the active board's groups + tasks
 * queries are still in flight.
 */
export function BoardSkeleton() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header — title row */}
      <div className="px-6 pt-5 border-b border-border shrink-0">
        <div className="flex items-center gap-3 mb-1">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-5 w-5 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-md" />
        </div>
        <Skeleton className="h-4 w-72 mb-3" />

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-2">
          <Skeleton className="h-7 w-20 rounded-md" />
          <Skeleton className="h-7 w-24 rounded-md" />
          <Skeleton className="h-7 w-24 rounded-md" />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 py-2">
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </div>

      {/* Body — two placeholder groups */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {[0, 1].map((g) => (
          <div key={g} className="space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-3 rounded-sm" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-12" />
            </div>
            <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
              {[0, 1, 2, 3].map((r) => (
                <div key={r} className="flex items-center gap-3 px-3 py-2.5">
                  <Skeleton className="h-4 w-4 rounded-sm" />
                  <Skeleton className="h-4 flex-1 max-w-[280px]" />
                  <Skeleton className="h-6 w-20 rounded-md" />
                  <Skeleton className="h-6 w-20 rounded-md" />
                  <Skeleton className="h-6 w-16 rounded-md" />
                  <Skeleton className="h-6 w-6 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
