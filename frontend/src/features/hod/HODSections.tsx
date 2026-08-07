import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePerformanceSections } from '@/hooks/analytics';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const HODSections = () => {
  const { data, loading } = usePerformanceSections();

  const sections = data?.breakdown ?? [];

  return (
    <main className="flex-1 overflow-y-auto p-4 bg-gray-50">
      <div className="mb-4">
        <p className="text-sm text-gray-600">
          {sections.length} section{sections.length !== 1 ? 's' : ''} in your department
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Section Overview</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : sections.length > 0 ? (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 hover:bg-gray-50">
                    <TableHead className="text-xs font-semibold text-gray-700">Section</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-700">Campus</TableHead>
                    <TableHead className="text-center text-xs font-semibold text-gray-700">Open</TableHead>
                    <TableHead className="text-center text-xs font-semibold text-gray-700">Resolved</TableHead>
                    <TableHead className="text-center text-xs font-semibold text-gray-700">Escalated</TableHead>
                    <TableHead className="text-center text-xs font-semibold text-gray-700">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sections.map(s => (
                    <TableRow key={s.section_id} className="border-t border-gray-200 hover:bg-gray-50">
                      <TableCell className="py-3">
                        <p className="text-sm font-medium text-gray-800">{s.section_type_name}</p>
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge variant="outline" className="text-xs">{s.campus_code}</Badge>
                      </TableCell>
                      <TableCell className="py-3 text-center">
                        <span className="text-sm font-medium text-orange-600">{s.open_count}</span>
                      </TableCell>
                      <TableCell className="py-3 text-center">
                        <span className="text-sm font-medium text-green-600">{s.resolved_count}</span>
                      </TableCell>
                      <TableCell className="py-3 text-center">
                        <span className="text-sm font-medium text-red-600">{s.escalated_count}</span>
                      </TableCell>
                      <TableCell className="py-3 text-center">
                        <span className="text-sm text-gray-600">{s.total}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">No sections found for your department</p>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
};

export default HODSections;
