import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useRoleAnalytics } from "@/hooks/analytics";
import { getPerformanceTechnicians } from "@/lib/api/analytics";

const TechniciansWorkload = () => {
  const { data, loading: analyticsLoading } = useRoleAnalytics(getPerformanceTechnicians);

  const technicians = data?.breakdown?.slice(0, 10) ?? [];

  return (
    <Card className="py-7 px-2">
      <CardHeader className="flex flex-row justify-between pb-5">
        <div>
          <CardTitle className="pb-2">Technician Workload</CardTitle>
          <CardDescription>Works assigned as per Technician</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        {analyticsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : technicians.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Technician</TableHead>
                  <TableHead className="text-primary text-center">Assigned</TableHead>
                  <TableHead className="text-status-resolved text-center">Resolved</TableHead>
                  <TableHead className="text-status-progress text-center">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {technicians.map((tech, i) => (
                  <TableRow key={tech.technician_id ?? `tech-${i}`}>
                    <TableCell className="font-medium text-sm">
                      {`${tech.first_name} ${tech.last_name}`.trim() || tech.username}
                    </TableCell>
                    <TableCell className="text-center text-sm text-primary font-medium">
                      {tech.total_assigned}
                    </TableCell>
                    <TableCell className="text-center text-sm text-status-resolved font-medium">
                      {tech.resolved_count}
                    </TableCell>
                    <TableCell className="text-center text-sm text-status-progress font-medium">
                      {tech.open_count}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            <p>No data available</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TechniciansWorkload;
