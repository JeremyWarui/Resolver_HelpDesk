import { useState } from 'react';
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { downloadReport, type ReportFormat } from '@/lib/api/analytics';
import { REPORT_DOWNLOADS } from '@/constants/analytics';
import type { ReportParams, UserRole } from '@/types';

const LABELS: Record<ReportFormat, { text: string; Icon: typeof FileText }> = {
  xlsx: { text: 'Excel', Icon: FileSpreadsheet },
  pdf: { text: 'PDF', Icon: FileText },
};

/** The report's download buttons, for the period and campus the page is showing. */
export default function ReportDownloads({ role, params }: { role: UserRole; params: ReportParams }) {
  const [busy, setBusy] = useState<ReportFormat | null>(null);
  const formats = REPORT_DOWNLOADS[role] ?? [];
  if (formats.length === 0) return null;

  async function download(format: ReportFormat) {
    setBusy(format);
    try {
      await downloadReport(format, params);
    } catch {
      toast.error('The report could not be downloaded. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {formats.map((format) => {
        const { text, Icon } = LABELS[format];
        return (
          <Button
            key={format}
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => download(format)}
            aria-label={`Download ${text} report`}
          >
            {busy === format
              ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              : <Icon className="h-4 w-4 mr-1.5" />}
            {text}
          </Button>
        );
      })}
    </div>
  );
}
