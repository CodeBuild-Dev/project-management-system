import { format, parseISO, differenceInDays } from 'date-fns';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface TimelineBarProps {
  start: string | null;
  end: string | null;
}

export function TimelineBar({ start, end }: TimelineBarProps) {
  if (!start || !end) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const startDate = parseISO(start);
  const endDate = parseISO(end);
  const days = differenceInDays(endDate, startDate) + 1;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="w-full max-w-[120px]">
          <div className="h-5 bg-primary/20 rounded-full overflow-hidden relative">
            <div
              className="h-full bg-primary rounded-full"
              style={{ width: '100%' }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-primary-foreground">
              {days}d
            </span>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>{format(startDate, 'MMM d')} - {format(endDate, 'MMM d, yyyy')}</p>
      </TooltipContent>
    </Tooltip>
  );
}
