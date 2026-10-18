import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import FacilityPatternTable from '@/components/shared/data/FacilityPatternTable';
import type { OverviewFacility } from '@/types';

/** The Reports page's Facility Health on a dashboard: the building, its faults
 *  and the trades they fell in, with the way through to the rest. */
export default function FacilityHealthSummary({ rows, onSeeMore }: {
  rows: OverviewFacility[] | null;
  onSeeMore: () => void;
}) {
  return (
    <Card aria-label="Facility Health">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Facility Health</CardTitle>
          <CardDescription>Buildings where faults keep coming back this week, and in which trade.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={onSeeMore}>See more in Reports</Button>
      </CardHeader>
      <CardContent>
        {rows == null ? (
          <Skeleton className="h-40 w-full" />
        ) : rows.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No building shows a pattern this week.</p>
        ) : (
          <FacilityPatternTable rows={rows} />
        )}
      </CardContent>
    </Card>
  );
}
