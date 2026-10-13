import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Attachment, Person } from '@/data/types';
import { useWorkspaces } from '@/lib/workspaces/WorkspaceContext';
import { COLLABORATION_ENABLED } from '@/lib/features';
import { PersonAvatar } from './PersonAvatar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AtSign,
  Paperclip,
  Smile,
  Send,
  Bold,
  Italic,
  List,
  X,
  File as FileIcon,
} from 'lucide-react';

interface UpdateComposerProps {
  currentUser: Person;
  onSubmit: (payload: {
    content: string;
    mentions: string[];
    attachments: Attachment[];
  }) => void;
}

export interface UpdateComposerHandle {
  /** Focus the textarea and prepend a `@mention` for the given person. */
  replyTo: (person: Person) => void;
}

// A small curated set — Giphy / full emoji library can land post-backend.
const EMOJI_SET = [
  '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇',
  '🥰', '😍', '🤩', '😘', '😗', '😋', '😛', '🤪', '🤨', '🧐', '🤓', '😎', '😕',
  '😔', '😟', '😳', '😵', '😡', '😭', '😱', '🤯', '😴', '🤤', '👍', '👎', '👌',
  '👏', '🙌', '🤝', '💪', '🙏', '✌️', '🤞', '🤘', '🫡', '❤️', '🧡', '💛', '💚',
  '💙', '💜', '🖤', '🤍', '🔥', '✨', '⭐', '🎉', '🎊', '🚀', '💯', '✅', '❌',
  '⚠️', '📝', '📄', '📊', '💻', '📞', '📧', '⏰', '📅', '✏️',
];

export const UpdateComposer = forwardRef<UpdateComposerHandle, UpdateComposerProps>(
  function UpdateComposer({ currentUser, onSubmit }, ref) {
  const { members } = useWorkspaces();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [mentionPopoverOpen, setMentionPopoverOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionAnchor, setMentionAnchor] = useState<number | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      replyTo(person) {
        const token = `@[${person.name}](${person.id}) `;
        setContent((prev) => (prev.startsWith(token) ? prev : token + prev));
        requestAnimationFrame(() => {
          const el = textareaRef.current;
          if (!el) return;
          el.focus();
          const pos = el.value.length;
          el.setSelectionRange(pos, pos);
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      },
    }),
    []
  );

  const mentions = extractMentionIds(content);

  // Watch content for `@` trigger to open mention popover. The autocomplete
  // is gated by COLLABORATION_ENABLED — solo users still keep raw `@text`
  // they may type, but no popover surfaces.
  useEffect(() => {
    if (!COLLABORATION_ENABLED) return;
    const caret = textareaRef.current?.selectionStart;
    if (caret == null) return;
    // Look for an `@word` that ends at the caret.
    const textBeforeCaret = content.slice(0, caret);
    const match = /@([a-zA-Z]*)$/.exec(textBeforeCaret);
    if (match) {
      setMentionPopoverOpen(true);
      setMentionAnchor(caret - match[0].length);
      setMentionQuery(match[1]);
    } else {
      setMentionPopoverOpen(false);
      setMentionAnchor(null);
    }
  }, [content]);

  const submit = () => {
    const trimmed = content.trim();
    if (!trimmed && attachments.length === 0) return;
    onSubmit({ content: trimmed, mentions, attachments });
    setContent('');
    setAttachments([]);
  };

  const insertAtCursor = (text: string) => {
    const el = textareaRef.current;
    if (!el) {
      setContent((c) => c + text);
      return;
    }
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const next = content.slice(0, start) + text + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const wrapSelection = (prefix: string, suffix = prefix, placeholder = '') => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const selected = content.slice(start, end) || placeholder;
    const next = content.slice(0, start) + prefix + selected + suffix + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  };

  const pickMention = (p: Person) => {
    if (mentionAnchor == null || !textareaRef.current) return;
    const caret = textareaRef.current.selectionStart ?? content.length;
    const before = content.slice(0, mentionAnchor);
    const after = content.slice(caret);
    // Insert mention in a parseable form: @[name](id)
    const token = `@[${p.name}](${p.id}) `;
    const next = before + token + after;
    setContent(next);
    setMentionPopoverOpen(false);
    setMentionAnchor(null);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const pos = (before + token).length;
      el.setSelectionRange(pos, pos);
    });
  };

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    const newAttachments: Promise<Attachment>[] = Array.from(files).map(
      (file) =>
        new Promise<Attachment>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({
              id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              name: file.name,
              mimeType: file.type || 'application/octet-stream',
              size: file.size,
              url: reader.result as string,
            });
          };
          reader.readAsDataURL(file);
        })
    );
    Promise.all(newAttachments).then((atts) => {
      setAttachments((prev) => [...prev, ...atts]);
    });
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const filteredPeople = mentionPopoverOpen
    ? members.filter((p) =>
        p.name.toLowerCase().includes(mentionQuery.toLowerCase())
      )
    : [];

  return (
    <div className="border border-border rounded-lg bg-card">
      <div className="flex gap-3 p-3">
        <PersonAvatar person={currentUser} />
        <div className="flex-1 min-w-0">
          {/* Composer textarea */}
          <Popover open={mentionPopoverOpen && filteredPeople.length > 0}>
            <PopoverTrigger asChild>
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    submit();
                  }
                  if (e.key === 'Escape') {
                    setMentionPopoverOpen(false);
                  }
                }}
                placeholder={
                  COLLABORATION_ENABLED
                    ? 'Write an update… @mention a teammate. Cmd/Ctrl+Enter to post.'
                    : 'Write an update… Cmd/Ctrl+Enter to post.'
                }
                className="w-full min-h-[64px] resize-none text-sm bg-transparent outline-none placeholder:text-muted-foreground"
              />
            </PopoverTrigger>
            <PopoverContent
              className="w-56 p-1"
              align="start"
              side="bottom"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 pt-1 pb-1.5">
                Mention teammate
              </div>
              {filteredPeople.map((p) => (
                <button
                  key={p.id}
                  onClick={() => pickMention(p)}
                  onMouseDown={(e) => e.preventDefault()}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted rounded-sm"
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold overflow-hidden shrink-0"
                    style={{ backgroundColor: p.color }}
                  >
                    {p.avatar ? (
                      <img
                        src={p.avatar}
                        alt={p.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      p.initials
                    )}
                  </div>
                  <span className="text-xs truncate">{p.name}</span>
                </button>
              ))}
            </PopoverContent>
          </Popover>

          {/* Attachment previews */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {attachments.map((att) => (
                <AttachmentChip
                  key={att.id}
                  attachment={att}
                  onRemove={() => removeAttachment(att.id)}
                />
              ))}
            </div>
          )}

          {/* Toolbar */}
          <div className="flex items-center gap-0.5 mt-2 -mx-1">
            {COLLABORATION_ENABLED && (
              <ToolbarIcon
                label="Mention (@)"
                icon={AtSign}
                onClick={() => insertAtCursor('@')}
              />
            )}
            <ToolbarIcon
              label="Attach file"
              icon={Paperclip}
              onClick={() => fileInputRef.current?.click()}
            />
            <EmojiPickerButton onPick={(e) => insertAtCursor(e)} />
            <div className="w-px h-4 bg-border mx-1" />
            <ToolbarIcon
              label="Bold"
              icon={Bold}
              onClick={() => wrapSelection('**', '**', 'bold')}
            />
            <ToolbarIcon
              label="Italic"
              icon={Italic}
              onClick={() => wrapSelection('*', '*', 'italic')}
            />
            <ToolbarIcon
              label="Bulleted list"
              icon={List}
              onClick={() => insertAtCursor('\n- ')}
            />
            <div className="flex-1" />
            <Button
              size="sm"
              onClick={submit}
              disabled={!content.trim() && attachments.length === 0}
              className="h-7 px-3 text-xs"
            >
              <Send className="w-3 h-3 mr-1" />
              Post
            </Button>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
});

function ToolbarIcon({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: typeof AtSign;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

function EmojiPickerButton({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Emoji"
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <Smile className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 pb-1.5">
          Emoji
        </div>
        <div className="grid grid-cols-10 gap-0.5 max-h-52 overflow-y-auto">
          {EMOJI_SET.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                onPick(e);
                setOpen(false);
              }}
              className="aspect-square text-base hover:bg-muted rounded flex items-center justify-center"
            >
              {e}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove: () => void;
}) {
  const isImage = attachment.mimeType.startsWith('image/');
  if (isImage) {
    return (
      <div className="relative group/att">
        <img
          src={attachment.url}
          alt={attachment.name}
          className="h-20 w-auto rounded border border-border object-cover"
        />
        <button
          onClick={onRemove}
          className="absolute top-0.5 right-0.5 bg-black/60 hover:bg-black/80 text-white rounded p-0.5 opacity-0 group-hover/att:opacity-100 transition-opacity"
          aria-label="Remove attachment"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }
  return (
    <div className="group/att flex items-center gap-2 bg-muted rounded px-2 py-1.5 pr-1 max-w-[180px]">
      <FileIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <span className="text-xs truncate flex-1" title={attachment.name}>
        {attachment.name}
      </span>
      <button
        onClick={onRemove}
        className="opacity-0 group-hover/att:opacity-100 hover:bg-background rounded p-0.5"
        aria-label="Remove attachment"
      >
        <X className="w-3 h-3 text-muted-foreground" />
      </button>
    </div>
  );
}

// ----------- helpers -----------

/** Extract user IDs from `@[Name](userId)` tokens in content. */
function extractMentionIds(content: string): string[] {
  const ids: string[] = [];
  const re = /@\[[^\]]+\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) ids.push(m[1]);
  return Array.from(new Set(ids));
}
