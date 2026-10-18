import { useState } from 'react';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import * as catalogueService from '@/lib/api/catalogue';
import type { ServiceItem, Trade } from '@/types';
import { useTrades } from '@/hooks/useCatalogue';
import { TradeForm } from './TradeForm';
import { ItemForm } from './ItemForm';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { RowActions } from '@/components/shared/data/RowActions';

type DeleteTarget = { type: 'trade' | 'item'; id: number; name: string };

/**
 * The service catalogue: trades, and the faults reportable under each.
 *
 * Two levels, because that is what routing needs — the service item decides
 * the trade and the requester decides the campus.
 */
export default function CataloguePage() {
  // null = closed. The forms mount only while open, so their state resets
  // naturally between opens.
  const [tradeForm, setTradeForm] = useState<{ editing: Trade | null } | null>(null);
  const [itemForm, setItemForm] = useState<{ editing: ServiceItem | null; tradeId?: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const { trades, loading, invalidate } = useTrades();

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'trade') {
        await catalogueService.deleteTrade(deleteTarget.id);
        toast.success('Trade deleted');
      } else {
        await catalogueService.deleteServiceItem(deleteTarget.id);
        toast.success('Service item deleted');
      }
      setDeleteTarget(null);
      invalidate();
    } catch {
      // Ticket.service_item is PROTECT, so anything ever raised against stays.
      toast.error('Could not delete it — tickets have been raised against it. Retire it instead.');
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div>
            <p className="text-sm font-semibold text-gray-700">Trades</p>
            <p className="text-xs text-gray-400 mt-0.5">
              A trade groups the services one set of technicians handles. The service
              item a requester picks is what routes their ticket.
            </p>
          </div>
          <Button size="sm" variant="brand" onClick={() => setTradeForm({ editing: null })} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            New Trade
          </Button>
        </div>

        <div className="px-6 pb-6">
          {trades.length === 0 ? (
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-lg bg-gray-100 mb-3">
                <Plus className="h-6 w-6 text-gray-300" />
              </div>
              <p className="text-sm text-gray-500 font-medium">No trades yet</p>
              <p className="text-xs text-gray-400 mt-1">
                Add the first trade — Carpentry, Plumbing, Electrical.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3 items-start">
              {trades.map(trade => {
                const items: ServiceItem[] = trade.items ?? [];
                return (
                  <section
                    key={trade.id}
                    aria-label={trade.name}
                    className="rounded-xl border border-gray-200 bg-white overflow-hidden hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-50/70 border-b border-gray-100">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <h3 className="font-semibold text-sm text-gray-900">{trade.name}</h3>
                        <span className="text-[11px] font-mono text-gray-500 bg-white border border-gray-200 rounded px-1.5 py-0.5">
                          {trade.code}
                        </span>
                        {!trade.is_active && (
                          <Badge variant="secondary" className="text-xs text-orange-600 bg-orange-50 border-orange-200">
                            Retired
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-xs text-gray-500 tabular-nums mr-1">
                          {items.length} {items.length === 1 ? 'item' : 'items'}
                        </span>
                        <RowActions name={trade.name} onEdit={() => setTradeForm({ editing: trade })} onDelete={() => setDeleteTarget({ type: 'trade', id: trade.id, name: trade.name })} />
                      </div>
                    </div>

                    {items.length > 0 ? (
                      <ul className="divide-y divide-gray-100">
                        {items.map(item => (
                          <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-gray-50 transition-colors">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm text-gray-800 truncate">{item.name}</span>
                              {!item.is_active && (
                                <Badge variant="secondary" className="text-[10px] text-orange-600 bg-orange-50 border-orange-200">
                                  Retired
                                </Badge>
                              )}
                            </div>
                            <div className="flex gap-0.5 flex-shrink-0">
                              <RowActions name={item.name} onEdit={() => setItemForm({ editing: item, tradeId: trade.id })} onDelete={() => setDeleteTarget({ type: 'item', id: item.id, name: item.name })} />
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-gray-400 italic px-4 py-3">
                        No service items yet. Add the faults a requester can report under this trade.
                      </p>
                    )}

                    <div className="px-3 py-2 border-t border-gray-100">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Add Service Item to ${trade.name}`}
                        onClick={() => setItemForm({ editing: null, tradeId: trade.id })}
                        className="w-full justify-start text-xs gap-1.5 text-gray-600 hover:text-gray-900"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add service item
                      </Button>
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {tradeForm && (
        <TradeForm
          editing={tradeForm.editing}
          onSaved={() => { setTradeForm(null); invalidate(); }}
          onClose={() => setTradeForm(null)}
        />
      )}

      {itemForm && (
        <ItemForm
          tradeId={itemForm.tradeId}
          trades={trades}
          editing={itemForm.editing}
          onSaved={() => { setItemForm(null); invalidate(); }}
          onClose={() => setItemForm(null)}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete ${deleteTarget?.type === 'trade' ? 'trade' : 'service item'}?`}
        description={
          <>
            Delete <span className="font-medium text-gray-900">{deleteTarget?.name}</span>?
            Anything tickets have been raised against cannot be deleted — retire it instead.
          </>
        }
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        onConfirm={handleDelete}
        confirmLabel="Delete"
        variant="destructive"
      />
    </div>
  );
}
