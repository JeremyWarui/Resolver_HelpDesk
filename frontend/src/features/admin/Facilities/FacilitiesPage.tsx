// import { Button } from "@/components/ui/button";
// import { Plus, Filter, Download } from "lucide-react";
import FacilitiesTable from "./FacilitiesTable";
const FacilitiesPage = () => {
  return (
    <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
      <div className="flex justify-between mb-2">
        <div>
          {/* <h1 className="text-xl font-semibold text-gray-800">Facilities</h1> */}
          <p className="text-sm text-gray-600">
            Manage facilities and track maintenance issues
          </p>
        </div>
        {/* <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-1"
          >
            <Filter className="h-4 w-4" />
            Filter
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-1"
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button
            size="sm"
            className="flex items-center gap-1 bg-primary hover:bg-primary/90"
            onClick={() => setShowCreateTicket(true)}
          >
            <Plus className="h-4 w-4" />
            New Ticket
          </Button>
        </div> */}
      </div>
      <FacilitiesTable />
    </div>
  );
};

export default FacilitiesPage;
