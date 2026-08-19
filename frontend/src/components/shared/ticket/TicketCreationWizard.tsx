// TicketCreationWizard — 3-step modal for raising a maintenance ticket.
// Step 1: trade → service item (campus-filtered — a campus only offers the
//         trades it actually staffs)
// Step 2: description, optional contact number, and where it is
// Step 3: review + submit
//
// Payload: { service_item, description, contact_phone?, location }. Section,
// trade and priority are all derived server-side — the requester grades
// nothing and routes nothing.
//
// Location is unconditional: maintenance work happens somewhere, and a ticket
// the technician cannot find is not a ticket. What varies is which fields the
// form asks for, and that comes from the facility type — see FACILITY_FORMS,
// which mirrors apps/facilities/validators.py TYPE_SPECS.

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronRight, Check, Loader2, CheckCircle2, MapPin,
  Hammer, BrickWall, PaintRoller, Droplets, Zap, Wrench,
  Building2, BedDouble, Warehouse, Home, TreePine, Phone, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AttachmentUploader } from '@/components/shared/ticket/AttachmentUploader';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuthStore } from '@/stores/authStore';
import { createTicket, uploadAttachments } from '@/lib/api/tickets';
import { useCatalog, useCampusFacilities } from '@/hooks/catalog/useCatalog';
import type { CatalogItem, CatalogSubSection } from '@/lib/api/catalogue';
import type { FacilityTypeValue } from '@/constants/facilityTypes';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TicketCreationWizardProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  /** Pre-fill and skip ahead:
   *  subSectionCode set → opens at the item list for that trade.
   *  item set → opens at step 2 directly. */
  quickStart?: {
    subSectionCode?: string;
    item?: { id: number; name: string; description?: string };
  };
}

type Step = 1 | 2 | 3;
type SubStep = 'trade' | 'item';

const STEP_LABELS: Record<Step, string> = {
  1: 'Choose service',
  2: 'Provide details',
  3: 'Review & submit',
};

/** Icons by trade code. Unknown codes fall back to a spanner rather than
 *  breaking — adding a trade is a seed change, not a frontend release. */
const TRADE_ICONS: Record<string, LucideIcon> = {
  CARP: Hammer,
  MAS: BrickWall,
  PAINT: PaintRoller,
  PLUMB: Droplets,
  ELEC: Zap,
};

/** The location form per facility type — mirrors validators.py TYPE_SPECS.
 *  `label` is short on purpose: the six tiles sit on one row. */
interface FacilityForm {
  label: string;
  Icon: LucideIcon;
  /** Whether the type picks a named facility off the register. */
  needsFacility: boolean;
  required: string[];
  optional: string[];
}

const FACILITY_FORMS: Record<FacilityTypeValue, FacilityForm> = {
  office_block: { label: 'Office',     Icon: Building2, needsFacility: true,  required: ['floor', 'room'], optional: ['area'] },
  hostel:       { label: 'Hostel',     Icon: BedDouble, needsFacility: true,  required: ['room_number'],   optional: ['area'] },
  building:     { label: 'Building',   Icon: Warehouse, needsFacility: true,  required: [],                optional: ['room', 'area'] },
  residential:  { label: 'Staff Qtrs', Icon: Home,      needsFacility: false, required: ['tenant_name'],   optional: ['unit_number'] },
  equipment:    { label: 'Equipment',  Icon: Wrench,    needsFacility: false, required: ['asset_name'],    optional: ['asset_id', 'description'] },
  grounds:      { label: 'Grounds',    Icon: TreePine,  needsFacility: false, required: ['zone'],          optional: ['landmark'] },
};

/** Order the tiles are drawn in, most-used first. Typed against the shared
 *  code list, so a type added there without a form here fails to compile. */
const FACILITY_ORDER: FacilityTypeValue[] = [
  'office_block', 'hostel', 'building', 'residential', 'equipment', 'grounds',
];

const FIELD_LABELS: Record<string, { label: string; placeholder: string }> = {
  floor:       { label: 'Floor',       placeholder: 'e.g. Ground, 1st' },
  room:        { label: 'Room',        placeholder: 'e.g. Room 14' },
  area:        { label: 'Area',        placeholder: 'e.g. Boardroom' },
  room_number: { label: 'Room number', placeholder: 'e.g. B-214' },
  tenant_name: { label: 'Tenant name', placeholder: 'Who can let the technician in' },
  unit_number: { label: 'Unit / house no.', placeholder: 'e.g. Q-12' },
  asset_name:  { label: 'Asset name',  placeholder: 'e.g. Standby generator' },
  asset_id:    { label: 'Asset ID',    placeholder: 'e.g. AST-0042' },
  description: { label: 'Where it is', placeholder: 'e.g. Near reception' },
  zone:        { label: 'Zone',        placeholder: 'e.g. Football pitch, parking' },
  landmark:    { label: 'Landmark',    placeholder: 'e.g. Near gate B' },
};

function fieldMeta(name: string) {
  return FIELD_LABELS[name] ?? { label: name.replace(/_/g, ' '), placeholder: '' };
}

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

/** The one-row icon tile picker, used for both trades and facility types.
 *  Generic in the key so the facility tiles keep their narrow code type. */
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
    <div className="px-4 py-3 flex items-center justify-between gap-4">
      <span className="text-sm font-medium text-muted-foreground shrink-0 w-28">{label}</span>
      <span className="text-sm text-foreground text-right flex-1">{children}</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function TicketCreationWizard({ isOpen, onOpenChange, onSuccess, quickStart }: TicketCreationWizardProps) {
  const storeUser = useAuthStore((s) => s.user);
  const campusId = storeUser?.primary_campus_id ?? null;
  const queryClient = useQueryClient();

  // Wizard state
  const [step, setStep]                     = useState<Step>(quickStart?.item ? 2 : 1);
  const [subStep, setSubStep]               = useState<SubStep>(
    quickStart?.item || quickStart?.subSectionCode ? 'item' : 'trade');
  const [trade, setTrade]                   = useState<CatalogSubSection | null>(null);
  const [item, setItem]                     = useState<CatalogItem | null>(null);
  const [description, setDescription]       = useState('');
  const [contactPhone, setContactPhone]     = useState('');
  const [attachments, setAttachments]       = useState<File[]>([]);
  const [typeCode, setTypeCode]             = useState<FacilityTypeValue | null>(null);
  const [facilityId, setFacilityId]         = useState<number | null>(null);
  const [locationValues, setLocationValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting]         = useState<false | 'creating' | 'uploading'>(false);
  const [submitted, setSubmitted]           = useState(false);

  // Data — two queries for the whole wizard. Facilities come back once for the
  // campus and are grouped here, so clicking through the tiles costs nothing.
  const { data: trades = [], isLoading: loading } = useCatalog(campusId);
  const { data: facilities = [] } = useCampusFacilities(campusId);

  const form = typeCode ? FACILITY_FORMS[typeCode] : null;

  /** Facility types offered: the ones that need no facility are always
   *  available, the rest only where this campus has something to pick. */
  const tiles = useMemo(() => {
    const withFacilities = new Set(facilities.map((f) => f.type));
    return FACILITY_ORDER
      .filter((code) => !FACILITY_FORMS[code].needsFacility || withFacilities.has(code))
      .map((code) => ({ key: code, label: FACILITY_FORMS[code].label, Icon: FACILITY_FORMS[code].Icon }));
  }, [facilities]);

  const choices = useMemo(
    () => facilities.filter((f) => f.type === typeCode),
    [facilities, typeCode],
  );

  /** The facility type's server-side id, read off any facility of that type —
   *  which is why the list is fetched whole rather than per type. */
  const facilityTypeId = useMemo(
    () => facilities.find((f) => f.type === typeCode)?.facility_type ?? null,
    [facilities, typeCode],
  );

  // ── State sync during render (adjust-during-render pattern) ──────────────────

  const [prevIsOpen, setPrevIsOpen]           = useState(isOpen);
  const [prevQuickItemId, setPrevQuickItemId] = useState(quickStart?.item?.id);
  const [prevQuickTrade, setPrevQuickTrade]   = useState(quickStart?.subSectionCode);
  const [prevTrades, setPrevTrades]           = useState(trades);

  // Reset when the dialog opens or quickStart changes
  if (
    prevIsOpen !== isOpen ||
    prevQuickItemId !== quickStart?.item?.id ||
    prevQuickTrade !== quickStart?.subSectionCode
  ) {
    setPrevIsOpen(isOpen);
    setPrevQuickItemId(quickStart?.item?.id);
    setPrevQuickTrade(quickStart?.subSectionCode);
    if (isOpen) {
      setStep(quickStart?.item ? 2 : 1);
      setSubStep(quickStart?.item || quickStart?.subSectionCode ? 'item' : 'trade');
      setTrade(null); // resolved below, once the catalogue loads
      // Pre-fill from quickStart so the service banner shows immediately; the
      // lookup below upgrades it with the authoritative catalogue record.
      setItem(quickStart?.item
        ? { id: quickStart.item.id, name: quickStart.item.name, description: quickStart.item.description ?? '', is_active: true }
        : null);
      setDescription('');
      setContactPhone('');
      setAttachments([]);
      setTypeCode(null);
      setFacilityId(null);
      setLocationValues({});
      setSubmitted(false);
    }
  }

  // Invalidate the catalogue cache on open
  useEffect(() => {
    if (isOpen) queryClient.invalidateQueries({ queryKey: ['catalog'] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, quickStart?.item?.id, quickStart?.subSectionCode]);

  // Resolve the quickStart trade and item once the catalogue is loaded.
  if (isOpen && prevTrades !== trades && trades.length > 0) {
    setPrevTrades(trades);
    if (!trade) {
      if (quickStart?.item) {
        for (const t of trades) {
          const found = t.items?.find((si) => si.id === quickStart.item!.id);
          if (found) { setItem(found); setTrade(t); break; }
        }
      } else if (quickStart?.subSectionCode) {
        const found = trades.find((t) => t.code === quickStart.subSectionCode);
        if (found) setTrade(found);
      }
    }
  }

  const handleItemSelect = useCallback((si: CatalogItem) => setItem(si), []);

  function setVal(key: string, val: string) {
    setLocationValues((prev) => ({ ...prev, [key]: val }));
  }

  function pickType(code: FacilityTypeValue) {
    setTypeCode(code);
    setFacilityId(null);
    setLocationValues({});
  }

  const locationValid = useMemo(() => {
    if (!form) return false;
    if (form.needsFacility && !facilityId) return false;
    return form.required.every((name) => !!locationValues[name]?.trim());
  }, [form, facilityId, locationValues]);

  const canAdvance = useMemo(() => {
    if (step === 1) return item != null && subStep === 'item';
    if (step === 2) return description.trim().length >= 3 && locationValid;
    return true;
  }, [step, item, subStep, description, locationValid]);

  async function handleSubmit() {
    if (!item || !form || !facilityTypeId) return;
    setSubmitting('creating');
    try {
      // Send only the fields this type knows about — the server rejects
      // strays, and a blank optional field is not an answer.
      const values: Record<string, string> = {};
      for (const name of [...form.required, ...form.optional]) {
        const v = locationValues[name]?.trim();
        if (v) values[name] = v;
      }

      const result = await createTicket({
        service_item: item.id,
        description: description.trim(),
        ...(contactPhone.trim() ? { contact_phone: contactPhone.trim() } : {}),
        location: {
          facility_type: facilityTypeId,
          ...(form.needsFacility && facilityId ? { facility: facilityId } : {}),
          values,
        },
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
      <DialogContent className="sm:max-w-[680px] w-full flex flex-col p-6 gap-0 h-[85vh]">
        <DialogHeader className="pb-4 border-b flex-shrink-0 pr-10">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-base font-semibold">New Request</DialogTitle>
            {!submitted && <StepIndicator current={step} />}
          </div>
          <DialogDescription>
            Report a maintenance issue — pick the trade, describe the fault, and say where it is.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
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

                {/* Breadcrumb when viewing items */}
                {subStep === 'item' && trade && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <button type="button" onClick={goBackToTrades} className="text-primary hover:underline">
                      Trades
                    </button>
                    <span>/</span>
                    <span className="font-medium text-foreground">{trade.name}</span>
                  </div>
                )}

                {/* Trade selection */}
                {subStep === 'trade' && (
                  <>
                    <p className="text-sm text-muted-foreground">What kind of work does this need?</p>
                    {loading ? (
                      <div className="grid grid-cols-5 gap-2">
                        {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 w-full rounded-md" />)}
                      </div>
                    ) : trades.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">No maintenance trades are available at your campus.</p>
                    ) : (
                      <TileRow
                        columns="grid-cols-3 sm:grid-cols-5"
                        selected={trade?.code ?? null}
                        onSelect={(code) => {
                          setTrade(trades.find((t) => t.code === code) ?? null);
                          setItem(null);
                          setSubStep('item');
                        }}
                        items={trades.map((t) => ({
                          key: t.code,
                          label: t.name,
                          Icon: TRADE_ICONS[t.code] ?? Wrench,
                        }))}
                      />
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
                      <div className="space-y-2">
                        {(trade?.items ?? []).map((si) => (
                          <OptionCard
                            key={si.id}
                            selected={si.id === item?.id}
                            onClick={() => handleItemSelect(si)}
                            title={si.name}
                            description={si.description}
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

                {/* Location — always asked; the facility type shapes the form */}
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

                  {!form && (
                    <p className="mt-4 text-center text-xs text-muted-foreground">Select a facility type above to continue</p>
                  )}

                  {form && (
                    <div className="mt-3 border-t border-border/50 pt-3 space-y-3">
                      {form.needsFacility && (
                        <div className="space-y-1.5">
                          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            {form.label} <span className="text-destructive">*</span>
                          </Label>
                          <Select value={facilityId ? String(facilityId) : ''} onValueChange={(v) => setFacilityId(Number(v))}>
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder={choices.length === 0 ? 'None listed at your campus' : 'Select one'} />
                            </SelectTrigger>
                            <SelectContent>
                              {choices.map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {[...form.required, ...form.optional].length > 0 && (
                        <div className="grid grid-cols-2 gap-2">
                          {[...form.required, ...form.optional].map((name) => {
                            const { label, placeholder } = fieldMeta(name);
                            return (
                              <div key={name} className="space-y-1.5">
                                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                  {label} {form.required.includes(name) && <span className="text-destructive">*</span>}
                                </Label>
                                <Input
                                  className="h-8 text-sm"
                                  placeholder={placeholder}
                                  value={locationValues[name] ?? ''}
                                  onChange={(e) => setVal(name, e.target.value)}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
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
                    {form && <ReviewRow label="Location type">{form.label}</ReviewRow>}
                    {facilityId != null && (
                      <ReviewRow label={form?.label ?? 'Facility'}>
                        {choices.find((f) => f.id === facilityId)?.name ?? `#${facilityId}`}
                      </ReviewRow>
                    )}
                    {form && [...form.required, ...form.optional]
                      .filter((name) => locationValues[name]?.trim())
                      .map((name) => (
                        <ReviewRow key={name} label={fieldMeta(name).label}>
                          {locationValues[name]}
                        </ReviewRow>
                      ))}
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
        </ScrollArea>

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
