interface ComingSoonSectionProps {
  section: string;
}

export default function ComingSoonSection({ section }: ComingSoonSectionProps) {
  return (
    <div className="flex items-center justify-center h-full p-6">
      <div className="text-center max-w-md p-8 bg-white rounded-lg shadow-sm">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">{section} Coming Soon</h2>
        <p className="text-gray-600 mb-6">
          We're currently working on this feature. It will be available in a future update.
        </p>
        <div className="w-full bg-gray-200 h-2 rounded-full mb-4">
          <div className="bg-blue-600 h-2 rounded-full w-3/4" />
        </div>
        <p className="text-sm text-gray-500">Development in progress: 75% complete</p>
      </div>
    </div>
  );
}
