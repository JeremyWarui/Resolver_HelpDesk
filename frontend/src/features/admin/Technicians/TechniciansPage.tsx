// import { Button } from "@/components/ui/button";
// import { Plus, Filter, Download } from "lucide-react";
import TechniciansTable from "./TechniciansTable";

const TechniciansPage = () => {
  return (
    <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
      <div className="flex justify-between mb-2">
        <div>
          <p className="text-sm text-gray-600">
            Manage technicians in all the sections
          </p>
        </div>
      </div>

      {/* Technician stats will be added later with separate component */}
      
      <TechniciansTable />
    </div>
  );
};

export default TechniciansPage;
