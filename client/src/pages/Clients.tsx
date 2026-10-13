import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Archive,
  Briefcase,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
} from 'lucide-react';
import type {
  Client,
  ClientSource,
  ClientStatus,
  PricingModel,
} from '@projectmgmt/shared';
import { CountryPicker } from '@/components/CountryPicker';
import { ColoredHeader } from '@/components/ColoredHeader';
import { trpc } from '@/lib/trpc/client';
import { useWorkspaces } from '@/lib/workspaces/WorkspaceContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/EmptyState';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const SOURCE_OPTIONS: { value: ClientSource; label: string }[] = [
  { value: 'fiverr', label: 'Fiverr' },
  { value: 'upwork', label: 'Upwork' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'direct', label: 'Direct' },
  { value: 'referral', label: 'Referral' },
  { value: 'other', label: 'Other' },
];

const CURRENCY_OPTIONS = [
  { code: 'USD', label: 'USD — US Dollar' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'GBP', label: 'GBP — British Pound' },
  { code: 'CAD', label: 'CAD — Canadian Dollar' },
  { code: 'AUD', label: 'AUD — Australian Dollar' },
  { code: 'JPY', label: 'JPY — Japanese Yen' },
  { code: 'CHF', label: 'CHF — Swiss Franc' },
  { code: 'INR', label: 'INR — Indian Rupee' },
  { code: 'PKR', label: 'PKR — Pakistani Rupee' },
  { code: 'MYR', label: 'MYR — Malaysian Ringgit' },
  { code: 'SGD', label: 'SGD — Singapore Dollar' },
  { code: 'AED', label: 'AED — UAE Dirham' },
  { code: 'SAR', label: 'SAR — Saudi Riyal' },
  { code: 'TRY', label: 'TRY — Turkish Lira' },
  { code: 'NZD', label: 'NZD — New Zealand Dollar' },
];

const STATUS_FILTERS: Array<'all' | ClientStatus> = ['all', 'prospect', 'active', 'archived'];

const STATUS_BADGE: Record<ClientStatus, string> = {
  prospect: 'bg-status-yellow/20 text-status-yellow-fg',
  active: 'bg-status-green/20 text-status-green-fg',
  archived: 'bg-muted text-muted-foreground',
};

interface FormState {
  name: string;
  company: string;
  email: string;
  phone: string;
  country: string;
  notes: string;
  status: ClientStatus;
  currency: string;
  defaultHourlyRateMajor: string;
  defaultPricingModel: PricingModel;
  source: ClientSource;
}

const EMPTY_FORM: FormState = {
  name: '',
  company: '',
  email: '',
  phone: '',
  country: '',
  notes: '',
  status: 'active',
  currency: 'USD',
  defaultHourlyRateMajor: '',
  defaultPricingModel: 'hourly',
  source: 'direct',
};

function clientInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

function fromMinor(minorUnits: number): string {
  return (minorUnits / 100).toFixed(2);
}

function toMinor(major: string): number {
  const n = Number.parseFloat(major.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function formatRate(client: Client): string {
  if (client.defaultHourlyRate === 0) return '—';
  return `${fromMinor(client.defaultHourlyRate)} ${client.currency}/h`;
}

export default function Clients() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const { workspaces } = useWorkspaces();

  const [filter, setFilter] = useState<'all' | ClientStatus>('active');
  const [dialogState, setDialogState] = useState<{ open: boolean; editing: Client | null }>({
    open: false,
    editing: null,
  });
  const [archiveTarget, setArchiveTarget] = useState<Client | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const { data: clients = [], isLoading } = trpc.clients.list.useQuery({
    includeArchived: filter === 'all' || filter === 'archived',
    status: filter === 'all' ? undefined : (filter as ClientStatus),
  });

  const boardCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ws of workspaces) {
      for (const board of ws.boards) {
        if (board.clientId) {
          counts.set(board.clientId, (counts.get(board.clientId) ?? 0) + 1);
        }
      }
    }
    return counts;
  }, [workspaces]);

  const createMut = trpc.clients.create.useMutation({
    onSuccess: () => {
      utils.clients.list.invalidate();
      toast.success(t('clients.createdToast'));
      setDialogState({ open: false, editing: null });
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMut = trpc.clients.update.useMutation({
    onSuccess: () => {
      utils.clients.list.invalidate();
      toast.success(t('clients.updatedToast'));
      setDialogState({ open: false, editing: null });
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = trpc.clients.delete.useMutation({
    onSuccess: () => {
      utils.clients.list.invalidate();
      toast.success(t('clients.deleted'));
      setArchiveTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setDialogState({ open: true, editing: null });
  };

  const openEdit = (client: Client) => {
    setForm({
      name: client.name,
      company: client.company ?? '',
      email: client.email ?? '',
      phone: client.phone ?? '',
      country: client.country ?? '',
      notes: client.notes ?? '',
      status: client.status,
      currency: client.currency,
      defaultHourlyRateMajor:
        client.defaultHourlyRate > 0 ? fromMinor(client.defaultHourlyRate) : '',
      defaultPricingModel: client.defaultPricingModel,
      source: client.source,
    });
    setDialogState({ open: true, editing: client });
  };

  const submitForm = () => {
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      toast.error(t('clients.form.name'));
      return;
    }
    const payload = {
      name: trimmedName,
      company: form.company.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      country: form.country.trim() || null,
      notes: form.notes.trim() || null,
      status: form.status,
      currency: form.currency.trim().toUpperCase() || 'USD',
      defaultHourlyRate: toMinor(form.defaultHourlyRateMajor),
      defaultPricingModel: form.defaultPricingModel,
      source: form.source,
    };
    if (dialogState.editing) {
      updateMut.mutate({ id: dialogState.editing.id, data: payload });
    } else {
      createMut.mutate(payload);
    }
  };

  const submitting = createMut.isPending || updateMut.isPending;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gradient-to-br from-indigo-50/40 via-background to-violet-50/30 dark:from-indigo-950/15 dark:via-background dark:to-violet-950/15">
      <div className="px-6 sm:px-8 lg:px-10 pt-8 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('clients.title')}</h1>
            <p className="text-sm text-muted-foreground mt-1.5">{t('clients.subtitle')}</p>
          </div>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-sm shadow-primary/20"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('clients.newClient')}
          </button>
        </div>

        <div className="mt-5 flex gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === f
                  ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                  : 'bg-card border border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {t(`clients.filter${f.charAt(0).toUpperCase() + f.slice(1)}` as never)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 sm:px-8 lg:px-10 pb-8">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : clients.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-card shadow-sm py-16">
            <EmptyState
              icon={Briefcase}
              title={t('clients.empty')}
              description={t('clients.emptyDesc')}
              actionLabel={t('clients.newClient')}
              onAction={openCreate}
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <ColoredHeader
              icon={Briefcase}
              title="All clients"
              subtitle={`${clients.length} ${clients.length === 1 ? 'client' : 'clients'} in this view`}
              gradient="from-indigo-50 via-card to-card dark:from-indigo-950/30"
              iconGradient="from-indigo-500 to-violet-600"
            />
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="sticky top-0 z-10 bg-gradient-to-r from-muted/60 to-muted/40 backdrop-blur text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left font-semibold px-6 py-3">{t('clients.columns.name')}</th>
                  <th className="text-left font-semibold px-4 py-3">{t('clients.columns.company')}</th>
                  <th className="text-left font-semibold px-4 py-3">{t('clients.columns.status')}</th>
                  <th className="text-right font-semibold px-4 py-3">{t('clients.columns.rate')}</th>
                  <th className="text-right font-semibold px-4 py-3">{t('clients.columns.boards')}</th>
                  <th className="w-10 px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => {
                  const boardCount = boardCounts.get(c.id) ?? 0;
                  return (
                    <tr
                      key={c.id}
                      className="border-t border-border/50 hover:bg-accent/30 transition-colors group/row"
                    >
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-semibold text-white shadow-sm ${c.color}`}
                          >
                            {clientInitials(c.name)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-foreground truncate group-hover/row:text-primary transition-colors">
                              {c.name}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                              {c.email && (
                                <span className="flex items-center gap-1 truncate">
                                  <Mail className="w-3 h-3" /> {c.email}
                                </span>
                              )}
                              {c.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="w-3 h-3" /> {c.phone}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-foreground/80">{c.company ?? '—'}</td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${STATUS_BADGE[c.status]}`}
                        >
                          {t(`clients.status.${c.status}` as never)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-foreground/80 tabular-nums text-right font-medium">
                        {formatRate(c)}
                      </td>
                      <td className="px-4 py-3.5 text-foreground/80 text-right tabular-nums">
                        {boardCount}
                      </td>
                      <td className="px-2 py-3.5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="w-7 h-7 rounded-md hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(c)}>
                              <Pencil className="w-3.5 h-3.5 mr-2" /> {t('common.edit')}
                            </DropdownMenuItem>
                            {c.status !== 'archived' && (
                              <DropdownMenuItem
                                onClick={() => setArchiveTarget(c)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Archive className="w-3.5 h-3.5 mr-2" /> {t('common.delete')}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={dialogState.open}
        onOpenChange={(open) => !open && setDialogState({ open: false, editing: null })}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-2 border-b border-border/60">
            <DialogTitle className="text-lg">
              {dialogState.editing ? t('clients.form.editTitle') : t('clients.form.createTitle')}
            </DialogTitle>
            <DialogDescription>
              {dialogState.editing
                ? `Update ${dialogState.editing.name}.`
                : 'Add a new client to your roster.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-1">
            {/* Identity */}
            <section className="space-y-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Identity
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="client-name">{t('clients.form.name')}</Label>
                  <Input
                    id="client-name"
                    value={form.name}
                    placeholder={t('clients.form.namePlaceholder')}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="client-company">{t('clients.form.company')}</Label>
                  <Input
                    id="client-company"
                    value={form.company}
                    placeholder={t('clients.form.companyPlaceholder')}
                    onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="client-country">{t('clients.form.country')}</Label>
                  <CountryPicker
                    id="client-country"
                    value={form.country}
                    onChange={(c) => setForm((f) => ({ ...f, country: c }))}
                  />
                </div>
              </div>
            </section>

            {/* Contact */}
            <section className="space-y-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Contact
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="client-email">{t('clients.form.email')}</Label>
                  <Input
                    id="client-email"
                    type="email"
                    value={form.email}
                    placeholder={t('clients.form.emailPlaceholder')}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="client-phone">{t('clients.form.phone')}</Label>
                  <Input
                    id="client-phone"
                    value={form.phone}
                    placeholder="+1 555 123 4567"
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </div>
              </div>
            </section>

            {/* Billing */}
            <section className="space-y-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Billing
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="client-currency">{t('clients.form.currency')}</Label>
                  <Select
                    value={form.currency}
                    onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}
                  >
                    <SelectTrigger id="client-currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCY_OPTIONS.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('clients.form.pricingModel')}</Label>
                  <div className="grid grid-cols-2 rounded-md border border-input overflow-hidden text-sm h-10">
                    {(['hourly', 'fixed'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() =>
                          setForm((f) => ({ ...f, defaultPricingModel: mode }))
                        }
                        className={`transition-colors ${
                          form.defaultPricingModel === mode
                            ? 'bg-primary text-primary-foreground font-medium'
                            : 'bg-background text-foreground/70 hover:bg-accent/40'
                        }`}
                      >
                        {mode === 'hourly'
                          ? t('clients.form.pricingHourly')
                          : t('clients.form.pricingFixed')}
                      </button>
                    ))}
                  </div>
                </div>
                {form.defaultPricingModel === 'hourly' && (
                  <div className="col-span-2 space-y-1.5">
                    <Label htmlFor="client-rate">{t('clients.form.rate')}</Label>
                    <Input
                      id="client-rate"
                      inputMode="decimal"
                      value={form.defaultHourlyRateMajor}
                      placeholder={t('clients.form.ratePlaceholder')}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          defaultHourlyRateMajor: e.target.value,
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('clients.form.rateHelp')}
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* Funnel */}
            <section className="space-y-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Funnel
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="client-source">Source</Label>
                <Select
                  value={form.source}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, source: v as ClientSource }))
                  }
                >
                  <SelectTrigger id="client-source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Where did this client find you? Used for funnel reports.
                </p>
              </div>
            </section>

            {/* State */}
            <section className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3">
              <div>
                <Label htmlFor="client-status" className="text-sm font-semibold">
                  {t('clients.form.statusActive')}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('clients.form.statusActiveHelp')}
                </p>
              </div>
              <Switch
                id="client-status"
                checked={form.status === 'active'}
                onCheckedChange={(checked) =>
                  setForm((f) => ({
                    ...f,
                    status: checked ? 'active' : 'archived',
                  }))
                }
              />
            </section>

            {/* Notes */}
            <section className="space-y-1.5">
              <Label htmlFor="client-notes">{t('clients.form.notes')}</Label>
              <Textarea
                id="client-notes"
                rows={3}
                value={form.notes}
                placeholder={t('clients.form.notesPlaceholder')}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </section>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDialogState({ open: false, editing: null })}
              disabled={submitting}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={submitForm} disabled={submitting || !form.name.trim()}>
              {t('clients.form.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{archiveTarget?.name}</AlertDialogTitle>
            <AlertDialogDescription>{t('clients.deleteConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => archiveTarget && deleteMut.mutate({ id: archiveTarget.id })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
