import FacilitiesTable from "./FacilitiesTable";

const FacilitiesPage = () => {
  return (
    <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
      <p className="text-sm text-gray-600 mb-2">
        Manage facilities and track maintenance issues
      </p>
      <FacilitiesTable />
    </div>
  );
};

export default FacilitiesPage;
