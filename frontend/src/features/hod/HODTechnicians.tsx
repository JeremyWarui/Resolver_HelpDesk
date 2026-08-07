import { Card, CardContent } from '@/components/ui/card';
import useScopedTechnicians from '@/hooks/technicians/useScopedTechnicians';

const HODTechnicians = () => {
  const { technicians, loading } = useScopedTechnicians();

  return (
    <main className="flex-1 overflow-y-auto p-4 bg-gray-50">
      <div className="mb-4">
        <p className="text-sm text-gray-600">
          {technicians.length} technician{technicians.length !== 1 ? 's' : ''}
        </p>
      </div>

      <Card>
        <CardContent className="pt-2">
          {loading ? (
            <div className="space-y-3 p-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : technicians.length > 0 ? (
            <div className="divide-y">
              {technicians.map(t => (
                <div key={t.id} className="py-3 flex items-center gap-3 px-1">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                    {(t.name ?? t.username).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{t.name ?? t.username}</p>
                    <p className="text-xs text-gray-500">@{t.username}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-8">No technicians found</p>
          )}
        </CardContent>
      </Card>
    </main>
  );
};

export default HODTechnicians;
