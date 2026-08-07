// TicketCreationWizard — 3-step modal for raising a service ticket.
// Step 1: department → service item (campus-filtered, department-grouped)
// Step 2: description + conditional location (hardcoded per-type forms, D9)
// Step 3: review + submit
//
// Submit payload: { service_item_id, description, location? } — routing/priority resolved server-side (R6/R7).
// Location gate: category.location_details (§9.4).
// quickStart: pass departmentCode to pre-select dept; add item to jump straight to step 2.

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronRight, Check, Loader2, CheckCircle2,
  MapPin, Building, Wrench, Home, TreePine, Hotel, type LucideIcon,
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
import { createTicket } from '@/lib/api/tickets';
import { useCatalog, useFacilityTypes, useFacilitiesForType } from '@/hooks/catalog/useCatalog';
import type { CatalogCategory, CatalogItem } from '@/lib/api/catalogue';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Dept { id: number; name: string; code: string }

export interface TicketCreationWizardProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  /** Pre-fill and skip ahead:
   *  departmentCode set → opens at item sub-step filtered to that dept.
   *  item set → opens at step 2 directly. */
  quickStart?: {
    departmentCode?: string;
    category?: { id: number; name: string; location_details?: boolean };
    item?: { id: number; name: string; description?: string };
  };
}

type Step = 1 | 2 | 3;
type SubStep = 'department' | 'item';
type FacilityTypeCode = 'office_block' | 'building' | 'equipment' | 'residential' | 'grounds';

const FACILITY_TYPES: { code: FacilityTypeCode; label: string; Icon: LucideIcon; hasBuilding: boolean }[] = [
  { code: 'office_block', label: 'Office block', Icon: Building,  hasBuilding: true  },
  { code: 'building',     label: 'Building',     Icon: Hotel,     hasBuilding: true  },
  { code: 'equipment',    label: 'Equipment',    Icon: Wrench,    hasBuilding: false },
  { code: 'residential',  label: 'Residential',  Icon: Home,      hasBuilding: false },
  { code: 'grounds',      label: 'Grounds',      Icon: TreePine,  hasBuilding: false },
];

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
  const initStep: Step = quickStart?.item ? 2 : 1;
  const initSub: SubStep = quickStart?.item ? 'item' : (quickStart?.departmentCode ? 'item' : 'department');

  const [step, setStep]                     = useState<Step>(initStep);
  const [subStep, setSubStep]               = useState<SubStep>(initSub);
  const [selectedDepartment, setSelectedDepartment] = useState<Dept | null>(null);
  const [category, setCategory]             = useState<CatalogCategory | null>(null);
  const [item, setItem]                     = useState<CatalogItem | null>(null);
  const [description, setDescription]       = useState('');
  const [attachments, setAttachments]       = useState<File[]>([]);
  const [facilityTypeCode, setFacilityTypeCode] = useState<FacilityTypeCode | null>(null);
  const [facilityId, setFacilityId]         = useState<number | null>(null);
  const [locationValues, setLocationValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting]         = useState(false);
  const [submitted, setSubmitted]           = useState(false);

  // Data
  const { data: categories = [], isLoading: catsLoading } = useCatalog(campusId);
  const { data: facilityTypes = [] } = useFacilityTypes();
  const selectedFacilityDef = FACILITY_TYPES.find((ft) => ft.code === facilityTypeCode);
  const { data: buildings = [] } = useFacilitiesForType(
    campusId,
    selectedFacilityDef?.hasBuilding ? facilityTypeCode : null,
  );

  const facilityTypeId = useMemo(
    () => (facilityTypeCode ? (facilityTypes.find((ft) => ft.code === facilityTypeCode)?.id ?? null) : null),
    [facilityTypeCode, facilityTypes],
  );

  // Unique departments available at this campus.
  // ServiceCategorySerializer returns department as a derived { id, name, code } object — use it directly.
  const departments = useMemo<Dept[]>(() => {
    const seen = new Set<number>();
    const depts: Dept[] = [];
    for (const cat of categories) {
      const dept = cat.department;
      if (dept && !seen.has(dept.id)) {
        seen.add(dept.id);
        depts.push(dept);
      }
    }
    return depts.sort((a, b) => a.name.localeCompare(b.name));
  }, [categories]);

  // Categories filtered to the selected department
  const filteredCategories = useMemo(
    () => selectedDepartment
      ? categories.filter(c => c.department?.id === selectedDepartment.id)
      : categories,
    [categories, selectedDepartment],
  );

  // ── State sync during render (adjust-during-render pattern) ──────────────────

  const [prevIsOpen, setPrevIsOpen]         = useState(isOpen);
  const [prevQuickItemId, setPrevQuickItemId] = useState(quickStart?.item?.id);
  const [prevQuickDeptCode, setPrevQuickDeptCode] = useState(quickStart?.departmentCode);
  const [prevCategories, setPrevCategories] = useState(categories);
  const [prevDepts, setPrevDepts]           = useState(departments);

  // Reset when dialog opens or quickStart changes
  if (
    prevIsOpen !== isOpen ||
    prevQuickItemId !== quickStart?.item?.id ||
    prevQuickDeptCode !== quickStart?.departmentCode
  ) {
    setPrevIsOpen(isOpen);
    setPrevQuickItemId(quickStart?.item?.id);
    setPrevQuickDeptCode(quickStart?.departmentCode);
    if (isOpen) {
      setStep(quickStart?.item ? 2 : 1);
      setSubStep(quickStart?.item ? 'item' : (quickStart?.departmentCode ? 'item' : 'department'));
      setSelectedDepartment(null); // resolved below once departments load
      setCategory(null);
      // Pre-fill from quickStart so the service banner is visible immediately.
      // The catalog lookup below will still run to set category (needed for location_details).
      setItem(quickStart?.item
        ? { id: quickStart.item.id, name: quickStart.item.name, description: quickStart.item.description ?? '', is_active: true }
        : null);
      setDescription('');
      setAttachments([]);
      setFacilityTypeCode(null);
      setFacilityId(null);
      setLocationValues({});
      setSubmitted(false);
    }
  }

  // Invalidate catalog cache on open
  useEffect(() => {
    if (isOpen) queryClient.invalidateQueries({ queryKey: ['catalog'] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, quickStart?.item?.id, quickStart?.departmentCode]);

  // Resolve quickStart item + category from catalogue once loaded.
  // item is pre-filled from quickStart immediately; this block upgrades it with the
  // authoritative catalog record and sets category (needed for location_details).
  if (isOpen && prevCategories !== categories && categories.length > 0) {
    setPrevCategories(categories);
    if (quickStart?.item && !category) {
      for (const cat of categories) {
        const found = cat.items?.find((si) => si.id === quickStart.item!.id);
        if (found) { setItem(found); setCategory(cat); break; }
      }
    }
  }

  // Resolve quickStart departmentCode → selectedDepartment once departments list is ready
  if (isOpen && prevDepts !== departments && departments.length > 0) {
    setPrevDepts(departments);
    if (quickStart?.departmentCode && !selectedDepartment) {
      const found = departments.find(d => d.code === quickStart.departmentCode);
      if (found) setSelectedDepartment(found);
    }
  }

  // Select item + its parent category together
  const handleItemAndCatSelect = useCallback((cat: CatalogCategory, si: CatalogItem) => {
    if (cat.id !== category?.id) setCategory(cat);
    setItem(si);
  }, [category?.id]);

  // Location validation (per type, per SoT §9.4)
  const locationValid = useMemo(() => {
    if (!category?.location_details) return true;
    if (!facilityTypeCode) return false;
    if (facilityTypeCode === 'office_block') return !!facilityId && !!locationValues.floor?.trim() && !!locationValues.room?.trim();
    if (facilityTypeCode === 'building')     return !!facilityId && !!locationValues.area?.trim();
    if (facilityTypeCode === 'equipment')    return !!locationValues.asset_name?.trim();
    if (facilityTypeCode === 'residential')  return !!locationValues.unit_number?.trim();
    if (facilityTypeCode === 'grounds')      return !!locationValues.zone?.trim();
    return false;
  }, [category?.location_details, facilityTypeCode, facilityId, locationValues]);

  const canAdvance = useMemo(() => {
    if (step === 1) return item != null && subStep === 'item';
    if (step === 2) return description.trim().length >= 3 && locationValid;
    return true;
  }, [step, item, subStep, description, locationValid]);

  function setVal(key: string, val: string) {
    setLocationValues((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSubmit() {
    if (!item) return;
    setSubmitting(true);
    try {
      let locationPayload: { facility_type: number; facility?: number; values: Record<string, unknown> } | undefined;
      if (category?.location_details && facilityTypeCode && facilityTypeId) {
        locationPayload = {
          facility_type: facilityTypeId,
          ...(facilityId ? { facility: facilityId } : {}),
          values: { ...locationValues },
        };
      }
      const result = await createTicket({
        service_item: item.id,
        description: description.trim(),
        ...(locationPayload ? { location: locationPayload } : {}),
      });
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

  const loading = catsLoading;

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
            Submit a new service request — select a category, describe the issue, and confirm.
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
                  Your ticket has been created and routed to the appropriate team.
                </p>
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
              </div>
            )}

            {/* ── Step 1: Service picker ── */}
            {!submitted && step === 1 && (
              <div className="space-y-3">

                {/* Breadcrumb when viewing items */}
                {subStep === 'item' && selectedDepartment && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <button
                      type="button"
                      onClick={() => { setSubStep('department'); setSelectedDepartment(null); setItem(null); setCategory(null); }}
                      className="text-primary hover:underline"
                    >
                      Departments
                    </button>
                    <span>/</span>
                    <span className="font-medium text-foreground">{selectedDepartment.name}</span>
                  </div>
                )}

                {/* Department selection */}
                {subStep === 'department' && (
                  <>
                    <p className="text-sm text-muted-foreground">Which department are you requesting a service from?</p>
                    {loading ? (
                      <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
                    ) : departments.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">No services available at your campus.</p>
                    ) : (
                      <div className="space-y-2">
                        {departments.map((dept) => (
                          <OptionCard
                            key={dept.id}
                            selected={false}
                            onClick={() => { setSelectedDepartment(dept); setSubStep('item'); }}
                            title={dept.name}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* Service item selection — grouped by category */}
                {subStep === 'item' && (
                  <>
                    <p className="text-sm text-muted-foreground">Select the service you need.</p>
                    {loading ? (
                      <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
                    ) : filteredCategories.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">No services available.</p>
                    ) : (
                      <div className="space-y-4">
                        {filteredCategories.map((cat) => (
                          <div key={cat.id}>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 px-0.5">
                              {cat.name}
                            </p>
                            <div className="space-y-2">
                              {(cat.items ?? []).map((si) => (
                                <OptionCard
                                  key={si.id}
                                  selected={si.id === item?.id}
                                  onClick={() => handleItemAndCatSelect(cat, si)}
                                  title={si.name}
                                  description={si.description}
                                />
                              ))}
                            </div>
                          </div>
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
                      <p className="text-xs text-muted-foreground">Service</p>
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
                    placeholder="Describe your request in detail…"
                    rows={4}
                  />
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

                {/* Location (conditional on category.location_details) */}
                {category?.location_details && (
                  <>
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
                        Facility / Location
                      </p>

                      <div className="grid grid-cols-5 gap-2">
                        {FACILITY_TYPES.map(({ code, label, Icon }) => (
                          <button
                            key={code}
                            type="button"
                            onClick={() => { setFacilityTypeCode(code); setFacilityId(null); setLocationValues({}); }}
                            className={cn(
                              'flex flex-col items-center gap-1 rounded-md border px-1 py-2.5 text-center transition-colors',
                              facilityTypeCode === code
                                ? 'border-primary bg-primary/10'
                                : 'border-border bg-background hover:bg-muted/50',
                            )}
                          >
                            <Icon className={cn('h-5 w-5', facilityTypeCode === code ? 'text-primary' : 'text-muted-foreground')} />
                            <span className={cn('text-[10px] leading-tight', facilityTypeCode === code ? 'font-medium text-primary' : 'text-muted-foreground')}>
                              {label}
                            </span>
                          </button>
                        ))}
                      </div>

                      {!facilityTypeCode && (
                        <p className="mt-4 text-center text-xs text-muted-foreground">Select a facility type above to continue</p>
                      )}

                      {facilityTypeCode && (
                        <div className="mt-3 border-t border-border/50 pt-3 space-y-3">

                          {facilityTypeCode === 'office_block' && (
                            <>
                              <div className="space-y-1.5">
                                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                  Building <span className="text-destructive">*</span>
                                </Label>
                                <Select value={facilityId ? String(facilityId) : ''} onValueChange={(v) => setFacilityId(Number(v))}>
                                  <SelectTrigger className="h-8 text-sm">
                                    <SelectValue placeholder={buildings.length === 0 ? 'No buildings available' : 'Select building'} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {buildings.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <div className="space-y-1.5">
                                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Floor <span className="text-destructive">*</span></Label>
                                  <Input className="h-8 text-sm" placeholder="e.g. Ground, 1st" value={locationValues.floor ?? ''} onChange={(e) => setVal('floor', e.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Room <span className="text-destructive">*</span></Label>
                                  <Input className="h-8 text-sm" placeholder="e.g. Room 14" value={locationValues.room ?? ''} onChange={(e) => setVal('room', e.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Area</Label>
                                  <Input className="h-8 text-sm" placeholder="e.g. Boardroom" value={locationValues.area ?? ''} onChange={(e) => setVal('area', e.target.value)} />
                                </div>
                              </div>
                            </>
                          )}

                          {facilityTypeCode === 'building' && (
                            <>
                              <div className="space-y-1.5">
                                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Building <span className="text-destructive">*</span></Label>
                                <Select value={facilityId ? String(facilityId) : ''} onValueChange={(v) => setFacilityId(Number(v))}>
                                  <SelectTrigger className="h-8 text-sm">
                                    <SelectValue placeholder={buildings.length === 0 ? 'No buildings' : 'Select building'} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {buildings.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1.5">
                                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Area <span className="text-destructive">*</span></Label>
                                  <Input className="h-8 text-sm" placeholder="e.g. Laundry room" value={locationValues.area ?? ''} onChange={(e) => setVal('area', e.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Room</Label>
                                  <Input className="h-8 text-sm" placeholder="e.g. Room 3" value={locationValues.room ?? ''} onChange={(e) => setVal('room', e.target.value)} />
                                </div>
                              </div>
                            </>
                          )}

                          {facilityTypeCode === 'equipment' && (
                            <>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1.5">
                                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Asset name <span className="text-destructive">*</span></Label>
                                  <Input className="h-8 text-sm" placeholder="e.g. HP LaserJet" value={locationValues.asset_name ?? ''} onChange={(e) => setVal('asset_name', e.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Asset ID</Label>
                                  <Input className="h-8 text-sm" placeholder="e.g. AST-0042" value={locationValues.asset_id ?? ''} onChange={(e) => setVal('asset_id', e.target.value)} />
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Description</Label>
                                <Input className="h-8 text-sm" placeholder="e.g. Near reception" value={locationValues.description ?? ''} onChange={(e) => setVal('description', e.target.value)} />
                              </div>
                            </>
                          )}

                          {facilityTypeCode === 'residential' && (
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1.5">
                                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Unit / House no. <span className="text-destructive">*</span></Label>
                                <Input className="h-8 text-sm" placeholder="e.g. A-12, Block 3" value={locationValues.unit_number ?? ''} onChange={(e) => setVal('unit_number', e.target.value)} />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Tenant name</Label>
                                <Input className="h-8 text-sm" placeholder="e.g. John Mwangi" value={locationValues.tenant_name ?? ''} onChange={(e) => setVal('tenant_name', e.target.value)} />
                              </div>
                            </div>
                          )}

                          {facilityTypeCode === 'grounds' && (
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1.5">
                                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Zone <span className="text-destructive">*</span></Label>
                                <Input className="h-8 text-sm" placeholder="e.g. Football pitch, Parking lot" value={locationValues.zone ?? ''} onChange={(e) => setVal('zone', e.target.value)} />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Landmark</Label>
                                <Input className="h-8 text-sm" placeholder="e.g. Near gate B" value={locationValues.landmark ?? ''} onChange={(e) => setVal('landmark', e.target.value)} />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Step 3: Review ── */}
            {!submitted && step === 3 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Review your request before submitting.</p>

                {(category || item) && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Service</p>
                    <div className="border rounded-lg divide-y">
                      {selectedDepartment && <ReviewRow label="Department">{selectedDepartment.name}</ReviewRow>}
                      {category && <ReviewRow label="Category">{category.name}</ReviewRow>}
                      {item && <ReviewRow label="Service">{item.name}</ReviewRow>}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Request Details</p>
                  <div className="border rounded-lg divide-y">
                    <ReviewRow label="Description"><span className="whitespace-pre-wrap">{description}</span></ReviewRow>
                    {facilityTypeCode && (
                      <ReviewRow label="Facility type">
                        {FACILITY_TYPES.find((t) => t.code === facilityTypeCode)?.label ?? facilityTypeCode}
                      </ReviewRow>
                    )}
                    {facilityId && buildings.length > 0 && (
                      <ReviewRow label="Building">
                        {buildings.find((b) => b.id === facilityId)?.name ?? `Building #${facilityId}`}
                      </ReviewRow>
                    )}
                    {locationValues.floor       && <ReviewRow label="Floor">{locationValues.floor}</ReviewRow>}
                    {locationValues.room        && <ReviewRow label="Room">{locationValues.room}</ReviewRow>}
                    {locationValues.area        && <ReviewRow label="Area">{locationValues.area}</ReviewRow>}
                    {locationValues.asset_name  && <ReviewRow label="Asset">{locationValues.asset_name}</ReviewRow>}
                    {locationValues.asset_id    && <ReviewRow label="Asset ID">{locationValues.asset_id}</ReviewRow>}
                    {locationValues.unit_number && <ReviewRow label="Unit">{locationValues.unit_number}</ReviewRow>}
                    {locationValues.tenant_name && <ReviewRow label="Tenant">{locationValues.tenant_name}</ReviewRow>}
                    {locationValues.zone        && <ReviewRow label="Zone">{locationValues.zone}</ReviewRow>}
                    {locationValues.landmark    && <ReviewRow label="Landmark">{locationValues.landmark}</ReviewRow>}
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
                    if (subStep === 'item') {
                      setSubStep('department');
                      setSelectedDepartment(null);
                      setItem(null);
                      setCategory(null);
                      return;
                    }
                    onOpenChange(false);
                  } else {
                    setStep((s) => (s - 1) as Step);
                    if (step === 2) setSubStep('item');
                  }
                }}
                disabled={submitting}
                className="gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                {step === 1 && subStep === 'department' ? 'Cancel' : 'Back'}
              </Button>

              {step < 3 ? (
                <Button size="sm" onClick={() => setStep((s) => (s + 1) as Step)} disabled={!canAdvance} className="gap-1">
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button size="sm" onClick={handleSubmit} disabled={submitting} className="gap-1.5">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {submitting ? 'Submitting…' : 'Submit request'}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default TicketCreationWizard;
