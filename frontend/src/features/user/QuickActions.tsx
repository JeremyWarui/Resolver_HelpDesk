import { useState, useMemo, useEffect } from 'react';
import {
  ChevronDown, ChevronUp,
  Laptop, Wrench, Users, Shield, Truck, Receipt, Layers,
  AlertCircle,
  Building2,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/client';

// ── Backend shape for /section-types/ ────────────────────────────────────────

interface CatalogueSectionCategory {
  id: number;
  name: string;
  section_type_name: string;
  is_active: boolean;
  location_details: boolean;
  icon: string | null;
  service_items: Array<{
    id: number;
    name: string;
    description: string;
    is_active: boolean;
  }>;
}

interface CatalogueSectionType {
  id: number;
  name: string;
  code: string;
  department_id: number;
  department_code: string;
  department_name: string;
  service_categories: CatalogueSectionCategory[];
}

// ── Color theme — keyed on department code / name ─────────────────────────────

interface CategoryTheme {
  color: string;
  lightBg: string;
  icon: React.ElementType;
}

function getDeptTheme(deptCode: string, deptName?: string): CategoryTheme {
  const key = `${deptCode} ${deptName ?? ''}`.toLowerCase();
  if (/^ict|tech|\bit\b|comput|digital/.test(key))
    return { color: '#185FA5', lightBg: 'bg-blue-100 dark:bg-blue-950/50', icon: Laptop };
  if (/^adm|maint|facilit|admin/.test(key))
    return { color: '#854F0B', lightBg: 'bg-amber-100 dark:bg-amber-950/50', icon: Building2 };
  if (/^hr|human|payroll|staff|leave|welfare/.test(key))
    return { color: '#3B6D11', lightBg: 'bg-green-100 dark:bg-green-950/50', icon: Users };
  if (/secur|access|guard|incident/.test(key))
    return { color: '#A32D2D', lightBg: 'bg-red-100 dark:bg-red-950/50', icon: Shield };
  if (/transport|travel|vehic|car|fleet/.test(key))
    return { color: '#5F5E5A', lightBg: 'bg-stone-200 dark:bg-stone-700/50', icon: Truck };
  if (/finance|financ|payment|account|invoic|reimburse/.test(key))
    return { color: '#534AB7', lightBg: 'bg-violet-100 dark:bg-violet-950/50', icon: Receipt };
  return { color: '#6B7280', lightBg: 'bg-gray-100 dark:bg-gray-800/50', icon: Layers };
}

// ── Item icon — pick based on item/category name ──────────────────────────────

function getItemIcon(itemName: string, catName: string): React.ElementType {
  const key = `${itemName} ${catName}`.toLowerCase();
  if (/plumb|water|pipe|drain/.test(key)) return Wrench;
  if (/electr|power|light|wiring/.test(key)) return Wrench;
  if (/carpent|mason|repair|build/.test(key)) return Wrench;
  if (/vehicle|transport|travel|car|fleet|booking/.test(key)) return Truck;
  if (/internet|network|wifi|phone|connect/.test(key)) return Laptop;
  if (/erp|software|system|email/.test(key)) return Laptop;
  if (/payroll|salary|loan|rent|deduct/.test(key)) return Receipt;
  if (/file|registry|record/.test(key)) return Layers;
  return Wrench;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QuickActionItem {
  id: number;
  name: string;
  description: string;
}

export interface QuickActionCategory {
  id: number;
  name: string;
  location_details: boolean;
}

interface QuickActionsProps {
  onServiceSelect: (ctx: {
    sectionTypeId: number;
    departmentCode: string;
    category?: QuickActionCategory;
    item?: QuickActionItem;
  }) => void;
}

interface DeptEntry {
  sectionTypeId: number;
  category: QuickActionCategory;
  item: QuickActionItem;
}

interface DeptGroup {
  departmentId: number;
  departmentCode: string;
  departmentName: string;
  theme: CategoryTheme;
  entries: DeptEntry[];
}

// ── DepartmentBox ─────────────────────────────────────────────────────────────

const VISIBLE_ITEM_LIMIT = 4;

interface DepartmentBoxProps {
  group: DeptGroup;
  onServiceSelect: QuickActionsProps['onServiceSelect'];
}

function DepartmentBox({ group, onServiceSelect }: DepartmentBoxProps) {
  const [expanded, setExpanded] = useState(false);
  const { theme, departmentName, departmentCode, entries } = group;
  const DeptIcon = theme.icon;

  const visible = expanded ? entries : entries.slice(0, VISIBLE_ITEM_LIMIT);
  const hasMore = entries.length > VISIBLE_ITEM_LIMIT;
  const firstSectionTypeId = entries[0]?.sectionTypeId ?? 0;

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className={cn('w-7 h-7 rounded-md flex items-center justify-center shrink-0', theme.lightBg)}>
          <DeptIcon className="h-3.5 w-3.5" style={{ color: theme.color }} />
        </div>
        <span className="text-[13px] font-semibold text-foreground flex-1 leading-tight">
          {departmentName}
        </span>
        <button
          type="button"
          onClick={() => onServiceSelect({ sectionTypeId: firstSectionTypeId, departmentCode })}
          className="text-xs font-medium hover:underline whitespace-nowrap text-muted-foreground hover:text-foreground"
        >
          View All →
        </button>
      </div>

      <Separator className="my-3" />

      {/* Service item tile grid */}
      <div className="grid grid-cols-2 gap-2">
        {visible.map(({ sectionTypeId, category, item }) => {
          const ItemIcon = getItemIcon(item.name, category.name);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onServiceSelect({ sectionTypeId, departmentCode, category, item })}
              className="aspect-square border border-border bg-background rounded-lg p-3 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-muted/50 hover:border-border/80 transition-all text-center"
            >
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', theme.lightBg)}>
                <ItemIcon className="h-4 w-4" style={{ color: theme.color }} />
              </div>
              <span className="text-[11px] font-medium text-card-foreground leading-snug w-full">
                {item.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* See More / See Less toggle */}
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded(prev => !prev)}
          className="mt-3 self-start text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          {expanded ? (
            <><ChevronUp className="h-3 w-3" /> See Less</>
          ) : (
            <><ChevronDown className="h-3 w-3" /> See {entries.length - VISIBLE_ITEM_LIMIT} More</>
          )}
        </button>
      )}
    </div>
  );
}

// ── QuickActions ──────────────────────────────────────────────────────────────

const QuickActions = ({ onServiceSelect }: QuickActionsProps) => {
  const [sectionTypes, setSectionTypes] = useState<CatalogueSectionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get<CatalogueSectionType[]>('/section-types/');
        if (cancelled) return;
        const data = Array.isArray(res.data) ? res.data : (res.data as { results?: CatalogueSectionType[] })?.results ?? [];
        setSectionTypes(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load services');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Flatten: one entry per active service item, grouped by department
  const deptGroups = useMemo<DeptGroup[]>(() => {
    const groupMap = new Map<number, DeptGroup>();

    for (const st of sectionTypes) {
      for (const cat of (st.service_categories ?? []).filter(c => c.is_active)) {
        for (const item of (cat.service_items ?? []).filter(i => i.is_active)) {
          const entry: DeptEntry = {
            sectionTypeId: st.id,
            category: { id: cat.id, name: cat.name, location_details: cat.location_details },
            item: { id: item.id, name: item.name, description: item.description },
          };
          const existing = groupMap.get(st.department_id);
          if (existing) {
            existing.entries.push(entry);
          } else {
            groupMap.set(st.department_id, {
              departmentId: st.department_id,
              departmentCode: st.department_code,
              departmentName: st.department_name || st.department_code,
              theme: getDeptTheme(st.department_code, st.department_name),
              entries: [entry],
            });
          }
        }
      }
    }

    return Array.from(groupMap.values());
  }, [sectionTypes]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-7 rounded-md" />
                <Skeleton className="h-4 w-32 rounded" />
              </div>
              <Skeleton className="h-px w-full" />
              <div className="grid grid-cols-2 gap-2">
                {[1, 2, 3, 4].map(j => <Skeleton key={j} className="aspect-square rounded-lg" />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground gap-2">
        <AlertCircle className="h-8 w-8 text-destructive opacity-60" />
        <p className="text-sm font-medium text-destructive">Could not load services</p>
        <p className="text-xs">{error}</p>
      </div>
    );
  }

  if (deptGroups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground gap-2">
        <Wrench className="h-8 w-8 opacity-20" />
        <p className="text-sm">No services available yet.</p>
        <p className="text-xs opacity-70">Contact your administrator to set up the service catalogue.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {deptGroups.map(group => (
          <DepartmentBox key={group.departmentId} group={group} onServiceSelect={onServiceSelect} />
        ))}
      </div>
    </div>
  );
};

export default QuickActions;
