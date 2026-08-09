import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePerformanceTrades } from '@/hooks/analytics';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/**
 * Trade breakdown for the caller's campus department.
 *
 * This was "Section Overview" and rendered exactly one row — a HOD's scope is
 * a single campus department, which holds a single Maintenance section, so the
 * table restated the dashboard's stat cards in six columns. The trade is the
 * split that actually varies within that scope, and it is the split the HOD
 * acts on: which craft is carrying the backlog, and which is falling behind.
 */
const HODSections = () => {
  const { data, loading } = usePerformanceTrades();

  const trades = data?.breakdown ?? [];

  return (
    <main className="flex-1 overflow-y-auto p-4 bg-gray-50">
      <div className="mb-4">
        <p className="text-sm text-gray-600">
          {trades.length} trade{trades.length !== 1 ? 's' : ''} in your department
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Trade Overview</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : trades.length > 0 ? (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 hover:bg-gray-50">
                    <TableHead className="text-xs font-semibold text-gray-700">Trade</TableHead>
                    <TableHead className="text-center text-xs font-semibold text-gray-700">Open</TableHead>
                    <TableHead className="text-center text-xs font-semibold text-gray-700">Resolved</TableHead>
                    <TableHead className="text-center text-xs font-semibold text-gray-700">Escalated</TableHead>
                    <TableHead className="text-center text-xs font-semibold text-gray-700">SLA %</TableHead>
                    <TableHead className="text-center text-xs font-semibold text-gray-700">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trades.map(t => {
                    const slaPct = t.total_resolved_with_due > 0
                      ? Math.round((t.resolution_sla_met / t.total_resolved_with_due) * 100)
                      : null;
                    return (
                      <TableRow key={t.key} className="border-t border-gray-200 hover:bg-gray-50">
                        <TableCell className="py-3">
                          <p className="text-sm font-medium text-gray-800">{t.label}</p>
                        </TableCell>
                        <TableCell className="py-3 text-center">
                          <span className="text-sm font-medium text-orange-600">{t.open_count}</span>
                        </TableCell>
                        <TableCell className="py-3 text-center">
                          <span className="text-sm font-medium text-green-600">{t.resolved_count}</span>
                        </TableCell>
                        <TableCell className="py-3 text-center">
                          <span className="text-sm font-medium text-red-600">{t.escalated_count}</span>
                        </TableCell>
                        <TableCell className="py-3 text-center">
                          {slaPct != null ? (
                            <span
                              className={`text-sm font-medium ${
                                slaPct >= 90 ? 'text-green-600'
                                : slaPct >= 75 ? 'text-amber-600'
                                : 'text-red-600'
                              }`}
                            >
                              {slaPct}%
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3 text-center">
                          <span className="text-sm text-gray-600">{t.total}</span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">No trades found for your department</p>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
};

export default HODSections;
