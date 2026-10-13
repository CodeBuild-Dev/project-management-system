import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/lib/auth/AuthContext';
import { toast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { Camera, Trash2, Upload } from 'lucide-react';
import type { WorkMode } from '@projectmgmt/shared';

const WORK_MODE_LABELS: Record<WorkMode, string> = {
  remote: 'Remote',
  on_site: 'On-site',
  hybrid: 'Hybrid',
};

/** Resize an image File to a square JPEG data URL of the given edge size. */
async function fileToResizedDataUrl(file: File, edge = 256): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = edge;
  canvas.height = edge;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  // Cover-fit crop to a square.
  const scale = Math.max(edge / bitmap.width, edge / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  const dx = (edge - w) / 2;
  const dy = (edge - h) / 2;
  ctx.drawImage(bitmap, dx, dy, w, h);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}

export default function Profile() {
  const { user, updateProfile } = useAuth();
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [jobTitle, setJobTitle] = useState(user?.jobTitle ?? '');
  const [workMode, setWorkMode] = useState<WorkMode | ''>(user?.workMode ?? '');
  const [uploading, setUploading] = useState(false);

  if (!user) return null;

  const save = async () => {
    await updateProfile({
      firstName,
      lastName,
      email,
      avatarUrl,
      jobTitle: jobTitle.trim() || null,
      workMode: workMode === '' ? null : (workMode as WorkMode),
    });
    toast({ title: t('profile.savedToast'), description: t('profile.savedToastDesc') });
  };

  /** Falls back to the user's stored color when no photo is set. */
  const avatarBg = user.color;

  const onPickFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Unsupported file', description: 'Pick a PNG, JPEG, or WebP image.', variant: 'destructive' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'Image too large', description: 'Max 10 MB — pick a smaller file.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      setAvatarUrl(dataUrl);
    } catch (err) {
      toast({
        title: 'Could not read image',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase() || '??';

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="w-full p-6 sm:p-8 lg:p-10 space-y-8 max-w-3xl">
        <header>
          <h1 className="text-2xl font-semibold">{t('profile.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('profile.subtitle')}</p>
        </header>

        <Separator />

        {/* Avatar */}
        <section className="flex flex-col sm:flex-row sm:items-center gap-5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPickFile(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            aria-label={avatarUrl ? t('profile.replacePhoto') : t('profile.uploadPhoto')}
            className="group relative w-24 h-24 rounded-full overflow-hidden border border-border shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 disabled:opacity-60 shrink-0"
            style={avatarUrl ? undefined : { backgroundColor: avatarBg }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="w-full h-full flex items-center justify-center text-white text-3xl font-semibold">
                {initials}
              </span>
            )}
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-black/55 text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
              <Camera className="w-5 h-5" />
              <span className="text-[10px] font-medium tracking-wide">
                {uploading ? t('profile.processing') : t('profile.changePhoto')}
              </span>
            </span>
          </button>

          <div className="flex-1 space-y-3">
            <div>
              <p className="text-sm font-medium">Profile photo</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                PNG, JPEG, or WebP. Auto-resized to a 256×256 square. Max 10 MB.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                {avatarUrl ? t('profile.replacePhoto') : t('profile.uploadPhoto')}
              </Button>
              {avatarUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setAvatarUrl(null)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  {t('profile.removePhoto')}
                </Button>
              )}
            </div>
          </div>
        </section>

        <Separator />

        {/* Name */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">{t('profile.firstName')}</Label>
            <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">{t('profile.lastName')}</Label>
            <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </section>

        {/* Email */}
        <section className="space-y-1.5">
          <Label htmlFor="email">{t('profile.email')}</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <p className="text-[11px] text-muted-foreground">{t('profile.emailHint')}</p>
        </section>

        {/* Job info */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="jobTitle">Job title</Label>
            <Input
              id="jobTitle"
              placeholder="e.g. Senior Product Designer"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="workMode">Work mode</Label>
            <Select
              value={workMode === '' ? 'unset' : workMode}
              onValueChange={(v) => setWorkMode(v === 'unset' ? '' : (v as WorkMode))}
            >
              <SelectTrigger id="workMode">
                <SelectValue placeholder="Select work mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">Not set</SelectItem>
                <SelectItem value="remote">{WORK_MODE_LABELS.remote}</SelectItem>
                <SelectItem value="on_site">{WORK_MODE_LABELS.on_site}</SelectItem>
                <SelectItem value="hybrid">{WORK_MODE_LABELS.hybrid}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>

        {/* Save */}
        <div className="flex justify-end gap-2 sticky bottom-0 bg-background py-4">
          <Button onClick={save} disabled={uploading}>
            {t('common.saveChanges')}
          </Button>
        </div>
      </div>
    </div>
  );
}
