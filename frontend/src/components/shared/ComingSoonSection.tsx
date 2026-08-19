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
      </div>
    </div>
  );
}
