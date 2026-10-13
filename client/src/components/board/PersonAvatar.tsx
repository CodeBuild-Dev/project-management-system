import { Person } from '@/data/types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { User } from 'lucide-react';

interface PersonAvatarProps {
  person: Person | null;
}

export function PersonAvatar({ person }: PersonAvatarProps) {
  if (!person) {
    return (
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
        <User className="w-4 h-4 text-muted-foreground" />
      </div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white cursor-default shrink-0 overflow-hidden"
          style={{ backgroundColor: person.color }}
        >
          {person.avatar ? (
            <img
              src={person.avatar}
              alt={person.name}
              className="w-full h-full object-cover"
            />
          ) : (
            person.initials
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>{person.name}</p>
      </TooltipContent>
    </Tooltip>
  );
}
