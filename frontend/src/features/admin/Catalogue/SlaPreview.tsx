import { Clock } from 'lucide-react';
import { fmtMins } from './format';

/** Live "Respond within X · Resolve within Y" strip shown under priority selects. */
export function SlaPreview({
  responseMinutes,
  resolutionMinutes,
}: {
  responseMinutes: number;
  resolutionMinutes: number;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-blue-50 border border-blue-100 text-xs text-blue-700">
      <Clock className="h-3.5 w-3.5 flex-shrink-0" />
      <span>
        Respond within <strong>{fmtMins(responseMinutes)}</strong>
      </span>
      <span className="text-blue-300">·</span>
      <span>
        Resolve within <strong>{fmtMins(resolutionMinutes)}</strong>
      </span>
    </div>
  );
}
