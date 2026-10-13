import { useEffect, useRef, useState } from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { Attachment, TaskUpdate, Person } from '@/data/types';
import { PersonAvatar } from './PersonAvatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Heart,
  MessageSquare,
  MoreHorizontal,
  File as FileIcon,
  Download,
  Pencil,
  Trash2,
} from 'lucide-react';

interface UpdateCardProps {
  update: TaskUpdate;
  currentUser: Person;
  /** Save edited content. If omitted, edit is hidden. */
  onEdit?: (id: string, content: string) => void | Promise<void>;
  /** Delete the update. If omitted, delete is hidden. */
  onDelete?: (id: string) => void | Promise<void>;
  /** Reply: focus composer and prepend a @mention for this update's author. */
  onReply?: (author: Person) => void;
  /**
   * Whether the current user can edit/delete this update. Defaults to
   * "author can". Pass `true` to also allow admins/super-admins via UI.
   */
  canModify?: boolean;
}

/**
 * Renders a single update with author, content (mentions + markdown), attachments,
 * and like/reply stubs. Mentions + markdown parsing is intentionally lightweight;
 * a full WYSIWYG editor (TipTap/Lexical) can replace this once backend persistence
 * lands and we know what fidelity users actually need.
 */
export function UpdateCard({
  update,
  currentUser,
  onEdit,
  onDelete,
  onReply,
  canModify,
}: UpdateCardProps) {
  const [liked, setLiked] = useState(
    update.likedBy?.includes(currentUser.id) ?? false
  );
  const [likeCount, setLikeCount] = useState(update.likedBy?.length ?? 0);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(update.content);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);

  const isAuthor = update.author.id === currentUser.id;
  const showActions = (canModify ?? isAuthor) && (onEdit || onDelete);

  // Reset draft when the update content changes externally (e.g. SSE).
  useEffect(() => {
    if (!isEditing) setDraft(update.content);
  }, [update.content, isEditing]);

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus();
      const len = editRef.current.value.length;
      editRef.current.setSelectionRange(len, len);
    }
  }, [isEditing]);

  const toggleLike = () => {
    setLiked((v) => {
      const next = !v;
      setLikeCount((c) => c + (next ? 1 : -1));
      return next;
    });
  };

  const startEdit = () => {
    setDraft(update.content);
    setIsEditing(true);
  };
  const cancelEdit = () => {
    setDraft(update.content);
    setIsEditing(false);
  };
  const saveEdit = async () => {
    const next = draft.trim();
    if (!next || next === update.content || !onEdit) {
      setIsEditing(false);
      return;
    }
    try {
      setBusy(true);
      await onEdit(update.id, next);
      setIsEditing(false);
    } finally {
      setBusy(false);
    }
  };
  const performDelete = async () => {
    if (!onDelete) return;
    try {
      setBusy(true);
      await onDelete(update.id);
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <PersonAvatar person={update.author} />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{update.author.name}</div>
            <div className="text-[11px] text-muted-foreground">
              {formatDistanceToNow(parseISO(update.createdAt), { addSuffix: true })}
              {update.editedAt && (
                <span
                  className="ml-1"
                  title={`Edited ${formatDistanceToNow(parseISO(update.editedAt), {
                    addSuffix: true,
                  })}`}
                >
                  · edited
                </span>
              )}
            </div>
          </div>
        </div>
        {showActions && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted transition-colors"
                aria-label="More"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              {onEdit && (
                <DropdownMenuItem onClick={startEdit} disabled={isEditing}>
                  <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                </DropdownMenuItem>
              )}
              {onEdit && onDelete && <DropdownMenuSeparator />}
              {onDelete && (
                <DropdownMenuItem
                  onClick={() => setConfirmDelete(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Content / inline editor */}
      {isEditing ? (
        <div className="px-4 pb-3">
          <textarea
            ref={editRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void saveEdit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
              }
            }}
            className="w-full min-h-[72px] resize-none text-sm bg-transparent border border-border rounded p-2 outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex items-center justify-end gap-2 mt-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={cancelEdit}
              disabled={busy}
              className="h-7 px-3 text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={saveEdit}
              disabled={busy || !draft.trim() || draft.trim() === update.content}
              className="h-7 px-3 text-xs"
            >
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="px-4 pb-2 text-sm whitespace-pre-wrap break-words">
          <RichContent raw={update.content} />
        </div>
      )}

      {/* Attachments */}
      {!isEditing && update.attachments && update.attachments.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          {update.attachments.map((att) => (
            <AttachmentPreview key={att.id} attachment={att} />
          ))}
        </div>
      )}

      {/* Footer (like / reply stubs) */}
      <div className="border-t border-border px-2 py-1 flex items-center gap-1">
        <FooterButton
          icon={Heart}
          label={liked ? 'Liked' : 'Like'}
          count={likeCount}
          active={liked}
          onClick={toggleLike}
        />
        <FooterButton
          icon={MessageSquare}
          label="Reply"
          onClick={() => onReply?.(update.author)}
        />
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this update?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The comment will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void performDelete();
              }}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FooterButton({
  icon: Icon,
  label,
  count,
  active = false,
  onClick,
}: {
  icon: typeof Heart;
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted transition-colors text-xs ${
        active ? 'text-primary' : 'text-muted-foreground'
      }`}
    >
      <Icon className={`w-3.5 h-3.5 ${active ? 'fill-current' : ''}`} />
      <span>{label}</span>
      {count != null && count > 0 && <span className="font-medium">{count}</span>}
    </button>
  );
}

function AttachmentPreview({ attachment }: { attachment: Attachment }) {
  const isImage = attachment.mimeType.startsWith('image/');
  if (isImage) {
    return (
      <a
        href={attachment.url}
        download={attachment.name}
        target="_blank"
        rel="noreferrer"
        className="block"
      >
        <img
          src={attachment.url}
          alt={attachment.name}
          className="h-28 w-auto rounded border border-border object-cover hover:opacity-90 transition-opacity"
        />
      </a>
    );
  }
  return (
    <a
      href={attachment.url}
      download={attachment.name}
      className="flex items-center gap-2 bg-muted rounded px-2 py-1.5 pr-3 hover:bg-muted/80 transition-colors max-w-[240px]"
    >
      <FileIcon className="w-4 h-4 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-xs truncate">{attachment.name}</div>
        <div className="text-[10px] text-muted-foreground">
          {formatBytes(attachment.size)}
        </div>
      </div>
      <Download className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
    </a>
  );
}

/**
 * Light rendering pass:
 *   • Mentions `@[Name](id)` → highlighted span
 *   • `**bold**`               → <strong>
 *   • `*italic*`               → <em>
 *   • `\n- ` at start of lines → bulleted list
 * Plain text otherwise. A real parser (e.g. remark) lands with backend rich content.
 */
function RichContent({ raw }: { raw: string }) {
  const lines = raw.split('\n');
  const nodes: React.ReactNode[] = [];
  let bulletBuffer: React.ReactNode[] = [];

  const flushBullets = () => {
    if (bulletBuffer.length) {
      nodes.push(
        <ul key={`ul-${nodes.length}`} className="list-disc pl-5 space-y-0.5">
          {bulletBuffer.map((li, i) => (
            <li key={i}>{li}</li>
          ))}
        </ul>
      );
      bulletBuffer = [];
    }
  };

  lines.forEach((line, i) => {
    const bulletMatch = /^\s*-\s+(.*)$/.exec(line);
    if (bulletMatch) {
      bulletBuffer.push(renderInline(bulletMatch[1]));
      return;
    }
    flushBullets();
    if (line.trim() === '') {
      nodes.push(<br key={`br-${i}`} />);
    } else {
      nodes.push(<p key={`p-${i}`}>{renderInline(line)}</p>);
    }
  });
  flushBullets();

  return <div className="space-y-1">{nodes}</div>;
}

/** Parse mentions + bold + italic in a single line. */
function renderInline(text: string): React.ReactNode {
  // Regex matches: @[Name](id) | **bold** | *italic*
  const re = /@\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      parts.push(text.slice(lastIndex, m.index));
    }
    if (m[1]) {
      parts.push(
        <span
          key={key++}
          className="text-primary font-medium bg-primary/10 px-1 rounded"
        >
          @{m[1]}
        </span>
      );
    } else if (m[3]) {
      parts.push(
        <strong key={key++} className="font-semibold">
          {m[3]}
        </strong>
      );
    } else if (m[4]) {
      parts.push(<em key={key++}>{m[4]}</em>);
    }
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
