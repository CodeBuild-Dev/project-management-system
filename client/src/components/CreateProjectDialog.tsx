import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Briefcase,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWorkspaces } from '@/lib/workspaces/WorkspaceContext';
import { trpc } from '@/lib/trpc/client';

interface CredentialDraft {
  /** Local UI id only; never sent to the server. */
  uid: string;
  label: string;
  username: string;
  url: string;
  notes: string;
  password: string;
  showPassword: boolean;
}

const newDraft = (): CredentialDraft => ({
  uid: `draft-${Math.random().toString(36).slice(2, 10)}`,
  label: '',
  username: '',
  url: '',
  notes: '',
  password: '',
  showPassword: false,
});

type Tab = 'details' | 'proposal' | 'credentials';

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * One-screen "create a project" flow:
 *   • Details — title, client, description, deadline
 *   • Proposal — status, pricing model, rate / fixed price
 *   • Credentials — encrypted CRM/tool logins seeded with the project
 *
 * Lands the new project (board) in the active workspace, then bulk-creates
 * any credentials in a second tRPC call. The whole thing closes on success.
 */
export function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
  const { activeWorkspaceId } = useWorkspaces();
  const { data: clients = [] } = trpc.clients.list.useQuery({ status: 'active' });
  const utils = trpc.useUtils();

  const [tab, setTab] = useState<Tab>('details');

  // Details
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState<string>('none');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState(''); // yyyy-mm-dd

  // Proposal
  const [projectStatus, setProjectStatus] =
    useState<'proposal' | 'active' | 'invoiced' | 'paid'>('proposal');
  const [billingType, setBillingType] = useState<'non_billable' | 'hourly' | 'fixed'>(
    'hourly'
  );
  const [hourlyRateMajor, setHourlyRateMajor] = useState('');
  const [fixedPriceMajor, setFixedPriceMajor] = useState('');
  const [budgetMajor, setBudgetMajor] = useState('');

  // Credentials
  const [drafts, setDrafts] = useState<CredentialDraft[]>([]);

  const linkedClient = useMemo(
    () => (clientId === 'none' ? null : clients.find((c) => c.id === clientId) ?? null),
    [clientId, clients]
  );

  const createBoardMut = trpc.board.create.useMutation();
  const bulkCredsMut = trpc.boardCredential.create.useMutation();

  const reset = () => {
    setTab('details');
    setName('');
    setClientId('none');
    setDescription('');
    setDeadline('');
    setProjectStatus('proposal');
    setBillingType('hourly');
    setHourlyRateMajor('');
    setFixedPriceMajor('');
    setBudgetMajor('');
    setDrafts([]);
  };

  const close = () => {
    onOpenChange(false);
    // Wait for the close animation, then clear state.
    setTimeout(reset, 200);
  };

  const submitting = createBoardMut.isPending || bulkCredsMut.isPending;

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setTab('details');
      toast.error('Project needs a title.');
      return;
    }
    if (!activeWorkspaceId) {
      toast.error('No workspace available. Refresh and try again.');
      return;
    }

    // Validate credentials before we even touch the server.
    const usableDrafts = drafts.filter((d) => d.label.trim() && d.password);
    const halfFilled = drafts.find(
      (d) => (d.label.trim() && !d.password) || (!d.label.trim() && d.password)
    );
    if (halfFilled) {
      setTab('credentials');
      toast.error('Every credential needs both a label and a password.');
      return;
    }

    const toMinor = (v: string): number => {
      const n = Number.parseFloat(v.replace(',', '.'));
      return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
    };

    try {
      const board = await createBoardMut.mutateAsync({
        workspaceId: activeWorkspaceId,
        clientId: clientId === 'none' ? null : clientId,
        name: trimmed,
        description: description.trim() || undefined,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        projectStatus,
        billingType,
        hourlyRateOverride:
          billingType === 'hourly' && hourlyRateMajor
            ? toMinor(hourlyRateMajor)
            : null,
        fixedPrice:
          billingType === 'fixed' && fixedPriceMajor ? toMinor(fixedPriceMajor) : 0,
        budgetAmount: budgetMajor ? toMinor(budgetMajor) : null,
      });

      // Seed credentials, one network call each. They're rare (<5 per project
      // in practice) so the simplicity outweighs the bulk-endpoint cost.
      if (usableDrafts.length > 0) {
        await Promise.all(
          usableDrafts.map((d) =>
            bulkCredsMut.mutateAsync({
              boardId: board.id,
              label: d.label.trim(),
              username: d.username.trim() || null,
              url: d.url.trim() || null,
              notes: d.notes.trim() || null,
              password: d.password,
            })
          )
        );
      }

      utils.workspace.list.invalidate();
      toast.success(`Project "${trimmed}" created.`);
      close();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not create the project.'
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader className="pb-3 border-b border-border/60">
          <DialogTitle className="text-lg flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-primary" />
            New project
          </DialogTitle>
          <DialogDescription>
            One screen. Set the basics, lock in the proposal terms, and stash any
            tool logins you'll need.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mt-3">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="proposal">Proposal</TabsTrigger>
            <TabsTrigger value="credentials">
              <KeyRound className="w-3.5 h-3.5 mr-1.5" />
              Credentials
              {drafts.length > 0 && (
                <span className="ml-1.5 text-[10px] bg-primary/20 text-primary rounded-full px-1.5 py-0.5">
                  {drafts.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* DETAILS */}
          <TabsContent value="details" className="space-y-4 mt-5">
            <div className="space-y-1.5">
              <Label htmlFor="cp-name">Project title</Label>
              <Input
                id="cp-name"
                autoFocus
                value={name}
                placeholder="e.g. Marketing site rebuild"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-client">Client</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger id="cp-client">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No client (internal)</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-sm ${c.color}`}
                          aria-hidden
                        />
                        {c.name}
                        {c.company && (
                          <span className="text-muted-foreground">· {c.company}</span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {clients.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No active clients yet — you can link one later from the project header.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-desc">Description</Label>
              <Textarea
                id="cp-desc"
                rows={3}
                value={description}
                placeholder="What is this project about? Scope, goals, anything that helps later."
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-deadline">Deadline</Label>
              <Input
                id="cp-deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Overall delivery date for the project (separate from per-task due dates).
              </p>
            </div>
          </TabsContent>

          {/* PROPOSAL */}
          <TabsContent value="proposal" className="space-y-4 mt-5">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <div className="grid grid-cols-4 rounded-md border border-input overflow-hidden text-xs h-10">
                {(
                  [
                    { v: 'proposal', label: 'Proposal' },
                    { v: 'active', label: 'Active' },
                    { v: 'invoiced', label: 'Invoiced' },
                    { v: 'paid', label: 'Paid' },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.v}
                    type="button"
                    onClick={() => setProjectStatus(s.v)}
                    className={`transition-colors ${
                      projectStatus === s.v
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'bg-background text-foreground/70 hover:bg-accent/40'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Pricing model</Label>
              <div className="grid grid-cols-3 rounded-md border border-input overflow-hidden text-xs h-10">
                {(
                  [
                    { v: 'hourly', label: 'Hourly' },
                    { v: 'fixed', label: 'Fixed price' },
                    { v: 'non_billable', label: 'Non-billable' },
                  ] as const
                ).map((b) => (
                  <button
                    key={b.v}
                    type="button"
                    onClick={() => setBillingType(b.v)}
                    className={`transition-colors ${
                      billingType === b.v
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'bg-background text-foreground/70 hover:bg-accent/40'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            {billingType === 'hourly' && (
              <div className="space-y-1.5">
                <Label htmlFor="cp-rate">Hourly rate (override)</Label>
                <Input
                  id="cp-rate"
                  inputMode="decimal"
                  value={hourlyRateMajor}
                  placeholder={
                    linkedClient && linkedClient.defaultHourlyRate > 0
                      ? `Default: ${(linkedClient.defaultHourlyRate / 100).toFixed(2)} ${linkedClient.currency}/h`
                      : '0.00'
                  }
                  onChange={(e) => setHourlyRateMajor(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to inherit the client's default hourly rate.
                </p>
              </div>
            )}

            {billingType === 'fixed' && (
              <div className="space-y-1.5">
                <Label htmlFor="cp-fixed">Fixed price</Label>
                <Input
                  id="cp-fixed"
                  inputMode="decimal"
                  value={fixedPriceMajor}
                  placeholder="0.00"
                  onChange={(e) => setFixedPriceMajor(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="cp-budget">Budget cap (optional)</Label>
              <Input
                id="cp-budget"
                inputMode="decimal"
                value={budgetMajor}
                placeholder="0.00"
                onChange={(e) => setBudgetMajor(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Warns when logged time × rate or fixed-price burn approaches this number.
              </p>
            </div>
          </TabsContent>

          {/* CREDENTIALS */}
          <TabsContent value="credentials" className="space-y-3 mt-5">
            <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
              <ShieldCheck className="w-4 h-4 mt-0.5 text-primary shrink-0" />
              <div className="text-xs text-muted-foreground">
                Tool logins (WordPress, Stripe, hosting…) are encrypted at rest with
                AES-256-GCM. The plaintext password never lands in the database. You
                can reveal one at a time from the project page.
              </div>
            </div>

            {drafts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-8 text-center">
                <KeyRound className="w-6 h-6 mx-auto text-muted-foreground/50" />
                <p className="text-sm font-medium mt-2">No credentials yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Optional. Add any logins you'll need on this project.
                </p>
                <button
                  type="button"
                  onClick={() => setDrafts([newDraft()])}
                  className="inline-flex items-center gap-1.5 mt-3 text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add credential
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {drafts.map((d, i) => (
                    <div
                      key={d.uid}
                      className="rounded-lg border border-border/60 bg-card p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                          Credential {i + 1}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            setDrafts((arr) => arr.filter((x) => x.uid !== d.uid))
                          }
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          aria-label="Remove credential"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          placeholder="Label (e.g. WordPress admin)"
                          value={d.label}
                          onChange={(e) =>
                            setDrafts((arr) =>
                              arr.map((x) =>
                                x.uid === d.uid ? { ...x, label: e.target.value } : x
                              )
                            )
                          }
                        />
                        <Input
                          placeholder="URL (optional)"
                          value={d.url}
                          onChange={(e) =>
                            setDrafts((arr) =>
                              arr.map((x) =>
                                x.uid === d.uid ? { ...x, url: e.target.value } : x
                              )
                            )
                          }
                        />
                        <Input
                          placeholder="Username / email"
                          value={d.username}
                          onChange={(e) =>
                            setDrafts((arr) =>
                              arr.map((x) =>
                                x.uid === d.uid
                                  ? { ...x, username: e.target.value }
                                  : x
                              )
                            )
                          }
                        />
                        <div className="relative">
                          <Input
                            type={d.showPassword ? 'text' : 'password'}
                            placeholder="Password"
                            value={d.password}
                            className="pr-9"
                            onChange={(e) =>
                              setDrafts((arr) =>
                                arr.map((x) =>
                                  x.uid === d.uid
                                    ? { ...x, password: e.target.value }
                                    : x
                                )
                              )
                            }
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setDrafts((arr) =>
                                arr.map((x) =>
                                  x.uid === d.uid
                                    ? { ...x, showPassword: !x.showPassword }
                                    : x
                                )
                              )
                            }
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            aria-label={d.showPassword ? 'Hide password' : 'Show password'}
                          >
                            {d.showPassword ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                      <Textarea
                        rows={2}
                        placeholder="Notes (optional)"
                        value={d.notes}
                        onChange={(e) =>
                          setDrafts((arr) =>
                            arr.map((x) =>
                              x.uid === d.uid ? { ...x, notes: e.target.value } : x
                            )
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setDrafts((arr) => [...arr, newDraft()])}
                  className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-md border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add another credential
                </button>
              </>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="pt-2 border-t border-border/60 mt-4">
          <Button variant="ghost" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !name.trim()}>
            {submitting && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            Create project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
