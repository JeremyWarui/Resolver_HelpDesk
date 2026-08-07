import SectionsTable from './SectionsTable';

const SectionsPage = () => {
  return (
    <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
      <div className="flex justify-between mb-2">
        <div>
          <p className="text-sm text-gray-600">Manage sections and assign technicians</p>
        </div>
      </div>

      <SectionsTable />
    </div>
  );
};

export default SectionsPage;
