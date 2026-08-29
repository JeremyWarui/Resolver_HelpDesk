import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
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
          <Button size="sm" onClick={() => setTradeForm({ editing: null })} className="gap-1.5">
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
            <div className="space-y-4">
              {trades.map(trade => {
                const items: ServiceItem[] = trade.items ?? [];
                return (
                  <div key={trade.id} className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
                    <div className="flex items-start justify-between gap-3 pb-3 border-b border-gray-100">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium text-sm text-gray-900">{trade.name}</h3>
                        <span className="text-xs font-mono text-gray-400 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5">
                          {trade.code}
                        </span>
                        {!trade.is_active && (
                          <Badge variant="secondary" className="text-xs text-orange-600 bg-orange-50 border-orange-200">
                            Retired
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setTradeForm({ editing: trade })}
                          className="h-8 w-8 p-0 hover:bg-blue-50 text-gray-400 hover:text-blue-600"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget({ type: 'trade', id: trade.id, name: trade.name })}
                          className="h-8 w-8 p-0 hover:bg-red-50 text-gray-400 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1.5">
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Service Items</p>
                      {items.length > 0 ? (
                        items.map(item => (
                          <div key={item.id} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-gray-50 hover:bg-gray-100 transition-colors">
                            <p className="text-sm font-medium text-gray-900">{item.name}</p>
                            <div className="flex gap-1 flex-shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setItemForm({ editing: item, tradeId: trade.id })}
                                className="h-7 w-7 p-0 hover:bg-blue-100 text-gray-400 hover:text-blue-600"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteTarget({ type: 'item', id: item.id, name: item.name })}
                                className="h-7 w-7 p-0 hover:bg-red-100 text-gray-400 hover:text-red-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-gray-400 italic py-1">
                          No service items yet — add the faults a requester can report under this trade.
                        </p>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setItemForm({ editing: null, tradeId: trade.id })}
                        className="w-full text-xs mt-2 gap-1.5 text-gray-600 hover:text-gray-900"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Service Item to {trade.name}
                      </Button>
                    </div>
                  </div>
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
