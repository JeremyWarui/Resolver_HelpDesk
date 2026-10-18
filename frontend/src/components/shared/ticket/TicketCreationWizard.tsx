// Raising a ticket, in three steps: trade and service item, then the fault and
// where it is, then review.
//
// The payload is { service_item, description, contact_phone?, location }. Trade
// and priority are derived server-side: the requester grades nothing and routes
// nothing.
//
// Every ticket names a facility off the register and says where in it, in one
// line. The type tiles only narrow the facility list.

import { useState, useMemo, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronRight, Check, Loader2, CheckCircle2, MapPin, Phone,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AttachmentUploader } from '@/components/shared/ticket/AttachmentUploader';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuthStore } from '@/stores/authStore';
import { createTicket, uploadAttachments } from '@/lib/api/tickets';
import { useCatalog, useCampusFacilities } from '@/hooks/useCatalogue';
import type { CatalogItem, CatalogTrade } from '@/lib/api/catalogue';
import { TradeIcon } from '@/components/shared/ticket/TradeIcon';
import {
  FACILITY_TILES,
  FACILITY_ORDER,
  type FacilityTypeValue,
} from '@/constants/catalogue';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Pre-fill: opens the wizard on this trade's fault list rather than the
 *  trade tiles. The service item is always chosen here, in step 1 — the
 *  requester's catalogue cards name a trade and stop there. */
export interface TicketQuickStart {
  tradeCode?: string;
}

interface TicketCreationWizardProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  quickStart?: TicketQuickStart;
}

type Step = 1 | 2 | 3;
type SubStep = 'trade' | 'item';

const STEP_LABELS: Record<Step, string> = {
  1: 'Choose service',
  2: 'Provide details',
  3: 'Review & submit',
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-2">
      {([1, 2, 3] as Step[]).map((s) => (
        <div key={s} className="flex items-center gap-2">
          <div className={cn(
            'flex items-center justify-center h-7 w-7 rounded-full border-2 text-xs font-semibold transition-all',
            s < current  ? 'border-primary bg-primary text-primary-foreground'
            : s === current ? 'border-primary text-primary bg-primary/10'
            : 'border-muted-foreground/30 text-muted-foreground/50',
          )}>
            {s < current ? <Check className="h-3.5 w-3.5" /> : s}
          </div>
          <span className={cn('text-xs font-medium hidden sm:inline', s === current ? 'text-foreground' : 'text-muted-foreground')}>
            {STEP_LABELS[s]}
          </span>
          {s < 3 && <div className={`h-px w-6 ${s < current ? 'bg-primary' : 'bg-border'}`} />}
        </div>
      ))}
    </div>
  );
}

function OptionCard({ selected, onClick, title, description, badge }: {
  selected: boolean; onClick: () => void; title: string; description?: string; badge?: string;
}) {
  return (
    <button type="button" onClick={onClick} className={cn(
      'w-full text-left rounded-lg border p-3 transition-colors',
      selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/40 hover:bg-muted/40',
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{title}</p>
          {description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{description}</p>}
        </div>
        {badge && <Badge variant="outline" className="text-xs shrink-0">{badge}</Badge>}
      </div>
    </button>
  );
}

/** The one-row icon tile picker for facility types. Generic in the key so
 *  the tiles keep their narrow code type. */
function TileRow<K extends string>({ items, selected, onSelect, columns }: {
  items: { key: K; label: string; Icon: LucideIcon }[];
  selected: string | null;
  onSelect: (key: K) => void;
  columns: string;
}) {
  return (
    <div className={cn('grid gap-2', columns)}>
      {items.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          className={cn(
            'flex flex-col items-center gap-1 rounded-md border px-1 py-2.5 text-center transition-colors',
            selected === key ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-muted/50',
          )}
        >
          <Icon className={cn('h-5 w-5', selected === key ? 'text-primary' : 'text-muted-foreground')} />
          <span className={cn('text-[10px] leading-tight', selected === key ? 'font-medium text-primary' : 'text-muted-foreground')}>
            {label}
          </span>
        </button>
      ))}
    </div>
  );
}

function ReviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-3 sm:px-4 py-3 flex items-center justify-between gap-3 sm:gap-4">
      <span className="text-sm font-medium text-muted-foreground shrink-0 w-24 sm:w-28">{label}</span>
      <span className="text-sm text-foreground text-right flex-1 min-w-0 break-words">{children}</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function TicketCreationWizard({ isOpen, onOpenChange, onSuccess, quickStart }: TicketCreationWizardProps) {
  const storeUser = useAuthStore((s) => s.user);
  const campusId = storeUser?.primary_campus_id ?? null;
  const queryClient = useQueryClient();

  // Wizard state
  const [step, setStep]                     = useState<Step>(1);
  const [subStep, setSubStep]               = useState<SubStep>(
    quickStart?.tradeCode ? 'item' : 'trade');
  const [trade, setTrade]                   = useState<CatalogTrade | null>(null);
  const [item, setItem]                     = useState<CatalogItem | null>(null);
  const [description, setDescription]       = useState('');
  const [contactPhone, setContactPhone]     = useState('');
  const [attachments, setAttachments]       = useState<File[]>([]);
  const [typeCode, setTypeCode]             = useState<FacilityTypeValue | null>(null);
  const [facilityId, setFacilityId]         = useState<number | null>(null);
  const [locationDetail, setLocationDetail] = useState('');
  const [submitting, setSubmitting]         = useState<false | 'creating' | 'uploading'>(false);
  const [submitted, setSubmitted]           = useState(false);

  // Data — two queries for the whole wizard. Facilities come back once for the
  // campus and are grouped here, so clicking through the tiles costs nothing.
  const { data: trades = [], isLoading: loading } = useCatalog();
  const { data: facilities = [] } = useCampusFacilities(campusId);

  const tile = typeCode ? FACILITY_TILES[typeCode] : null;

  /** The types this campus has something registered under. A type with no
   *  facility here has nothing to raise a ticket against. */
  const tiles = useMemo(() => {
    const withFacilities = new Set(facilities.map((f) => f.facility_type_code));
    return FACILITY_ORDER
      .filter((code) => withFacilities.has(code))
      .map((code) => ({ key: code, label: FACILITY_TILES[code].label, Icon: FACILITY_TILES[code].Icon }));
  }, [facilities]);

  const choices = useMemo(
    () => facilities.filter((f) => f.facility_type_code === typeCode),
    [facilities, typeCode],
  );

  // ── State sync during render (adjust-during-render pattern) ──────────────────

  const [prevIsOpen, setPrevIsOpen]         = useState(isOpen);
  const [prevQuickTrade, setPrevQuickTrade] = useState(quickStart?.tradeCode);

  // Reset when the dialog opens or the pre-filled trade changes
  if (prevIsOpen !== isOpen || prevQuickTrade !== quickStart?.tradeCode) {
    setPrevIsOpen(isOpen);
    setPrevQuickTrade(quickStart?.tradeCode);
    if (isOpen) {
      setStep(1);
      setSubStep(quickStart?.tradeCode ? 'item' : 'trade');
      setTrade(null); // resolved below, once the catalogue loads
      setItem(null);
      setDescription('');
      setContactPhone('');
      setAttachments([]);
      setTypeCode(null);
      setFacilityId(null);
      setLocationDetail('');
      setSubmitted(false);
    }
  }

  // Invalidate the catalogue cache on open
  useEffect(() => {
    if (isOpen) queryClient.invalidateQueries({ queryKey: ['catalog'] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, quickStart?.tradeCode]);

  /**
   * Resolve the pre-filled trade as soon as the catalogue can answer for it.
   *
   * Gated on the trade still being unset, never on the catalogue's identity:
   * `useQuery` returns the same array on every render once it is cached, so a
   * reference check fires only on a refetch and leaves the item list empty.
   *
   * `subStep` is the guard against re-resolving: stepping back to the trade
   * tiles clears it, and this must not immediately undo that.
   */
  if (isOpen && !trade && subStep === 'item' && quickStart?.tradeCode && trades.length > 0) {
    const found = trades.find((t) => t.code === quickStart.tradeCode);
    if (found) setTrade(found);
  }

  // Picking a trade, or going back to change it, swaps the list under the
  // pressed button; focus moves to the new list rather than the dialog's top.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isOpen && step === 1) bodyRef.current?.querySelector<HTMLElement>('[data-options] button')?.focus();
  }, [isOpen, step, subStep, trades.length]);

  function pickType(code: FacilityTypeValue) {
    setTypeCode(code);
    setFacilityId(null);
  }

  const locationValid = facilityId != null && locationDetail.trim().length > 0;

  const canAdvance = useMemo(() => {
    if (step === 1) return item != null && subStep === 'item';
    if (step === 2) return description.trim().length >= 3 && locationValid;
    return true;
  }, [step, item, subStep, description, locationValid]);

  async function handleSubmit() {
    if (!item || !facilityId) return;
    setSubmitting('creating');
    try {
      const result = await createTicket({
        service_item: item.id,
        description: description.trim(),
        ...(contactPhone.trim() ? { contact_phone: contactPhone.trim() } : {}),
        location: { facility: facilityId, detail: locationDetail.trim() },
      });
      // Attachments go up after the ticket exists — the endpoint is
      // /tickets/<id>/attachments/, so there is no id to post to until now.
      if (attachments.length > 0) {
        setSubmitting('uploading');
        try {
          await uploadAttachments(result.id, attachments);
        } catch {
          // The ticket was created; only the files failed. Reporting a failed
          // submission here would send the user back to raise a duplicate.
          toast.warning(
            `Ticket ${result.ticket_no} created, but the attachments could not be uploaded. ` +
            `You can add them from the ticket.`,
          );
          queryClient.invalidateQueries({ queryKey: ['tickets'] });
          setSubmitted(true);
          onSuccess?.();
          return;
        }
      }

      toast.success(`Ticket ${result.ticket_no} created`);
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setSubmitted(true);
      onSuccess?.();
    } catch {
      toast.error('Failed to create ticket. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(open: boolean) {
    if (!open) setSubmitted(false);
    onOpenChange(open);
  }

  function goBackToTrades() {
    setSubStep('trade');
    setTrade(null);
    setItem(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[680px] w-full flex flex-col p-4 sm:p-6 gap-0 max-h-[90dvh]">
        <DialogHeader className="pb-4 border-b flex-shrink-0 pr-10">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-base font-semibold">New Request</DialogTitle>
            {!submitted && <StepIndicator current={step} />}
          </div>
          <DialogDescription>
            Report a maintenance issue — pick the trade, describe the fault, and say where it is.
          </DialogDescription>
        </DialogHeader>

        <div ref={bodyRef} className="flex-1 min-h-0 overflow-y-auto">
          <div className="py-5 space-y-4">

            {/* Success */}
            {submitted && (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
                <h3 className="text-base font-semibold">Request submitted</h3>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Your ticket has been created and routed to the maintenance team at your campus.
                </p>
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
              </div>
            )}

            {/* ── Step 1: Service picker ── */}
            {!submitted && step === 1 && (
              <div className="space-y-3">

                {/* The chosen trade, with the way back to the others */}
                {subStep === 'item' && trade && (
                  <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
                    <TradeIcon code={trade.code} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">Kind of work</p>
                      <p className="text-sm font-semibold truncate">{trade.name}</p>
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="text-xs h-auto py-1" onClick={goBackToTrades}>
                      Change
                    </Button>
                  </div>
                )}

                {/* Trade selection */}
                {subStep === 'trade' && (
                  <>
                    <p className="text-sm text-muted-foreground">What kind of work does this need?</p>
                    {loading ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[72px] w-full rounded-lg" />)}
                      </div>
                    ) : trades.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">No maintenance trades are available at your campus.</p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2" data-options>
                        {trades.map((t) => (
                          <button
                            key={t.code}
                            type="button"
                            aria-label={t.name}
                            aria-describedby={`tcw-trade-${t.code}`}
                            onClick={() => {
                              setTrade(t);
                              setItem(null);
                              setSubStep('item');
                            }}
                            className="flex items-center gap-3 rounded-lg border bg-background p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <TradeIcon code={t.code} />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold">{t.name}</span>
                              <span id={`tcw-trade-${t.code}`} className="block text-xs text-muted-foreground line-clamp-2">
                                {t.items.slice(0, 3).map((i) => i.name).join(', ')}
                                {t.items.length > 3 && '…'}
                              </span>
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* Service item selection */}
                {subStep === 'item' && (
                  <>
                    <p className="text-sm text-muted-foreground">Select the closest match to your problem.</p>
                    {loading ? (
                      <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
                    ) : (trade?.items ?? []).length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">No services listed under this trade.</p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2" data-options>
                        {(trade?.items ?? []).map((si) => (
                          <OptionCard
                            key={si.id}
                            selected={si.id === item?.id}
                            onClick={() => setItem(si)}
                            title={si.name}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Step 2: Details + location ── */}
            {!submitted && step === 2 && (
              <div className="space-y-5">
                {item && (
                  <div className="flex items-center justify-between gap-2 p-3 rounded-lg border bg-muted/30">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{trade?.name ?? 'Service'}</p>
                      <p className="text-sm font-medium truncate">{item.name}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="text-xs h-auto py-1 shrink-0" onClick={() => { setStep(1); setSubStep('item'); }}>
                      Change
                    </Button>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="tcw-desc">
                    Description <span className="text-destructive">*</span>
                    <span className="ml-1 text-xs text-muted-foreground">(min. 3 characters)</span>
                  </Label>
                  <Textarea
                    id="tcw-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the fault — what is wrong, and since when…"
                    rows={4}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="tcw-phone" className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    Contact number <span className="text-xs text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="tcw-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="0712 345 678"
                  />
                  <p className="text-xs text-muted-foreground">
                    Just in case the technician needs to call you. Leave it blank to use your own number.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label>Attachments <span className="text-xs text-muted-foreground">(optional)</span></Label>
                  <AttachmentUploader
                    value={attachments}
                    onChange={setAttachments}
                    maxFiles={5}
                    maxSizeMb={10}
                  />
                </div>

                {/* Location — always asked */}
                <div className="flex items-center gap-3">
                  <hr className="flex-1 border-border/60" />
                  <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                    Location details
                  </span>
                  <hr className="flex-1 border-border/60" />
                </div>

                <div className="rounded-lg border border-border/70 bg-muted/30 p-4">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-3">
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    Where is it? <span className="text-destructive">*</span>
                  </p>

                  <TileRow
                    columns="grid-cols-3 sm:grid-cols-6"
                    selected={typeCode}
                    onSelect={pickType}
                    items={tiles}
                  />

                  {!tile && (
                    <p className="mt-4 text-center text-xs text-muted-foreground">Select a facility type above to continue</p>
                  )}

                  {tile && (
                    <div className="mt-3 border-t border-border/50 pt-3 space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {tile.label} <span className="text-destructive">*</span>
                        </Label>
                        <Select value={facilityId ? String(facilityId) : ''} onValueChange={(v) => setFacilityId(Number(v))}>
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder={choices.length === 0 ? 'None listed at your campus' : 'Select one'} />
                          </SelectTrigger>
                          <SelectContent>
                            {choices.map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="tcw-where" className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          Where in it <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="tcw-where"
                          className="h-9 text-sm"
                          maxLength={200}
                          placeholder={tile.hint}
                          value={locationDetail}
                          onChange={(e) => setLocationDetail(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Step 3: Review ── */}
            {!submitted && step === 3 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Review your request before submitting.</p>

                {(trade || item) && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Service</p>
                    <div className="border rounded-lg divide-y">
                      {trade && <ReviewRow label="Trade">{trade.name}</ReviewRow>}
                      {item && <ReviewRow label="Service">{item.name}</ReviewRow>}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Request details</p>
                  <div className="border rounded-lg divide-y">
                    <ReviewRow label="Description"><span className="whitespace-pre-wrap">{description}</span></ReviewRow>
                    {contactPhone.trim() && <ReviewRow label="Contact">{contactPhone.trim()}</ReviewRow>}
                    {facilityId != null && (
                      <ReviewRow label={tile?.label ?? 'Facility'}>
                        {choices.find((f) => f.id === facilityId)?.name ?? `#${facilityId}`}
                      </ReviewRow>
                    )}
                    {locationDetail.trim() && <ReviewRow label="Where">{locationDetail.trim()}</ReviewRow>}
                  </div>
                </div>

                {attachments.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attachments</p>
                    <div className="border rounded-lg divide-y">
                      {attachments.map((f, i) => (
                        <ReviewRow key={i} label={`File ${i + 1}`}>{f.name}</ReviewRow>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        {!submitted && (
          <>
            <Separator />
            <div className="pt-4 flex items-center justify-between flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (step === 1) {
                    if (subStep === 'item') { goBackToTrades(); return; }
                    onOpenChange(false);
                  } else {
                    setStep((s) => (s - 1) as Step);
                    if (step === 2) setSubStep('item');
                  }
                }}
                disabled={!!submitting}
                className="gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                {step === 1 && subStep === 'trade' ? 'Cancel' : 'Back'}
              </Button>

              {step < 3 ? (
                <Button size="sm" onClick={() => setStep((s) => (s + 1) as Step)} disabled={!canAdvance} className="gap-1">
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button size="sm" onClick={handleSubmit} disabled={!!submitting} className="gap-1.5">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {submitting === 'uploading' ? 'Uploading attachments…' : submitting ? 'Submitting…' : 'Submit request'}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
