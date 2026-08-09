import { useMemo, useState } from 'react';
import { Layers, Wrench, ChevronRight, Plus, UserCog, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useSections } from '@/hooks/sections/useSections';
import { useSubSections } from '@/hooks/catalog/useSubSections';
import { useSectionTechnicianLinks } from '@/hooks/technicians/useSectionTechnicianLinks';
import { useScopedTechnicians } from '@/hooks/technicians/useScopedTechnicians';
import SectionForm from './SectionForm';
import type { Section } from '@/types/organisationStructure';

/**
 * Sections, and the trades staffed inside each.
 *
 * A Section is a campus × section type — with Maintenance the only type, that
 * is one section per campus. What matters operationally is not the section row
 * but what is staffed under it, so the rail lists sections and the detail
 * answers "which trades can this campus actually service, and by whom".
 *
 * Membership comes from the `SectionTechnician` link rows rather than the
 * roster's flat arrays. Crossing `sections[] × sub_sections[]` would list a
 * technician who is Carpentry@Nairobi and Plumbing@Mombasa as a Nairobi
 * plumber — the exact cross-product this system's scope code is written to
 * avoid, and it would be just as wrong on screen as in a queryset.
 */
export default function SectionsPage() {
  const { sections, loading, refetch } = useSections();
  const { subSections, loading: tradesLoading } = useSubSections();
  const { technicians } = useScopedTechnicians();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const list = sections as unknown as Section[];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((s) =>
      [s.name, s.code ?? '', s.campus?.name ?? '', s.hos_name ?? '']
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [list, search]);

  const selected = filtered.find((s) => s.id === selectedId) ?? filtered[0] ?? null;
  const { links, loading: linksLoading } = useSectionTechnicianLinks(selected?.id);

  const nameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of technicians) {
      map.set(t.id, `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim() || t.username);
    }
    return map;
  }, [technicians]);

  /** Every trade for this section — including the ones nobody covers. */
  const tradeRows = useMemo(() => {
    return subSections.map((trade) => {
      const members = links
        .filter((l) => l.sub_section === trade.id)
        .map((l) => ({ userId: l.user, name: nameById.get(l.user) ?? `User #${l.user}` }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return { ...trade, members };
    });
  }, [subSections, links, nameById]);

  const staffedCount = tradeRows.filter((t) => t.members.length > 0).length;
  const isLoading = loading || tradesLoading;

  return (
    <div className="flex-1 flex overflow-hidden bg-gray-50">
      {/* ── Rail: sections ──────────────────────────────────────────────── */}
      <div className="w-72 shrink-0 border-r bg-white flex flex-col overflow-hidden">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              placeholder="Search sections…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm pl-8"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {isLoading ? (
            [1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 rounded-md" />)
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400 italic">No sections found</div>
          ) : (
            filtered.map((section) => {
              const active = selected?.id === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => setSelectedId(section.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-md transition-colors flex items-center gap-2 group/item ${
                    active ? 'bg-primary/10' : 'hover:bg-gray-50'
                  }`}
                >
                  <Layers className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-primary' : 'text-gray-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm font-medium truncate ${active ? 'text-primary' : 'text-gray-700'}`}>
                        {section.campus?.name ?? 'No campus'}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-mono ml-auto shrink-0 ${active ? 'border-primary/40 text-primary' : ''}`}
                      >
                        {section.code ?? '—'}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {section.name} · {section.technician_count ?? 0} technician
                      {(section.technician_count ?? 0) === 1 ? '' : 's'}
                    </p>
                  </div>
                  <ChevronRight
                    className={`h-3.5 w-3.5 shrink-0 transition-opacity ${
                      active ? 'text-primary opacity-100' : 'text-gray-300 opacity-0 group-hover/item:opacity-100'
                    }`}
                  />
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Detail: the selected section's trades ───────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {selected == null ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-400">
            Select a section
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 px-6 py-4 border-b bg-white">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  {selected.campus?.name ?? 'No campus'} · {selected.name}
                  <Badge variant="outline" className="text-xs font-mono">{selected.code ?? '—'}</Badge>
                </h2>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <UserCog className="h-3.5 w-3.5 text-gray-400" />
                    {selected.hos_name ? (
                      <>Head of section: <span className="font-medium text-gray-700">{selected.hos_name}</span></>
                    ) : (
                      <span className="text-amber-600">No head of section assigned</span>
                    )}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-gray-400" />
                    {selected.technician_count ?? 0} technician
                    {(selected.technician_count ?? 0) === 1 ? '' : 's'}
                  </span>
                  <span>
                    {staffedCount} of {tradeRows.length} trades staffed
                  </span>
                </div>
              </div>
              <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setFormOpen(true)}>
                <Plus className="h-4 w-4" />
                Add Section
              </Button>
            </div>

            <div className="p-6 space-y-2">
              {linksLoading ? (
                [1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)
              ) : (
                tradeRows.map((trade) => (
                  <div
                    key={trade.id}
                    className={`p-4 bg-white border rounded-lg ${
                      trade.members.length === 0 ? 'border-amber-200 bg-amber-50/40' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Wrench
                        className={`h-3.5 w-3.5 ${trade.members.length === 0 ? 'text-amber-500' : 'text-gray-400'}`}
                      />
                      <span className="text-sm font-medium text-gray-900">{trade.name}</span>
                      <Badge variant="outline" className="text-[10px] font-mono">{trade.code}</Badge>
                      <span
                        className={`text-xs ml-auto ${
                          trade.members.length === 0 ? 'text-amber-600 font-medium' : 'text-gray-400'
                        }`}
                      >
                        {trade.members.length === 0
                          ? 'nobody assigned'
                          : `${trade.members.length} technician${trade.members.length === 1 ? '' : 's'}`}
                      </span>
                    </div>

                    {trade.members.length === 0 ? (
                      <p className="text-xs text-amber-700/80 pl-6">
                        Tickets for this trade still route to this campus — they will sit
                        unassignable until someone is added.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 pl-6">
                        {trade.members.map((m) => (
                          <span
                            key={m.userId}
                            className="inline-flex items-center gap-1.5 text-xs bg-gray-50 border rounded-full pl-1 pr-2.5 py-0.5"
                          >
                            <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[9px] font-semibold flex items-center justify-center">
                              {m.name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
                            </span>
                            {m.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      <SectionForm
        isOpen={formOpen}
        onOpenChange={setFormOpen}
        onSuccess={() => { setFormOpen(false); refetch(); }}
      />
    </div>
  );
}
