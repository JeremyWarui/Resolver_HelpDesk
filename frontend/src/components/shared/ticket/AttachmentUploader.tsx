import { useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import { X, FileText, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBytes } from '@/utils/format';

interface AttachmentUploaderProps {
  /** Controlled: the caller holds the list and this only reports edits to it.
   *  The upload happens once, after the ticket exists, in one request the
   *  caller makes — so there is no per-file progress here to report. */
  value: File[];
  onChange: (files: File[]) => void;
  maxFiles?: number;
  maxSizeMb?: number;
}

function AttachmentRow({ file, onRemove }: { file: File; onRemove: () => void }) {
  return (
    <li className="flex items-start gap-2 rounded-md border px-3 py-2">
      <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{file.name}</p>
        <p className="text-[10px] text-muted-foreground">{formatBytes(file.size)}</p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Remove ${file.name}`}
      >
        <X className="size-3.5" />
      </button>
    </li>
  );
}

export function AttachmentUploader({
  value,
  onChange,
  maxFiles = 5,
  maxSizeMb = 10,
}: AttachmentUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  function addFiles(incoming: FileList | File[]) {
    const picked = Array.from(incoming);

    if (value.length + picked.length > maxFiles) {
      toast.error(`Maximum ${maxFiles} files allowed`);
      return;
    }
    if (picked.some((f) => f.size > maxSizeMb * 1024 * 1024)) {
      toast.error(`Files must be smaller than ${maxSizeMb} MB`);
      return;
    }

    onChange([...value, ...picked]);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    addFiles(e.dataTransfer.files);
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload files"
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-6 transition-colors',
          isDragOver
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-accent/50',
        )}
      >
        <Upload className="size-5 text-muted-foreground" />
        <div className="text-center">
          <p className="text-sm font-medium">
            {isDragOver ? 'Drop files here' : 'Drag & drop or click to browse'}
          </p>
          <p className="text-xs text-muted-foreground">
            Up to {maxFiles} files · max {maxSizeMb} MB each
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        onChange={(e) => {
          if (e.target.files?.length) {
            addFiles(e.target.files);
            e.target.value = '';
          }
        }}
      />

      {value.length > 0 && (
        <ul className="flex flex-col gap-2">
          {value.map((file, i) => (
            <AttachmentRow
              key={`${file.name}-${file.size}-${i}`}
              file={file}
              onRemove={() => onChange(value.filter((_, at) => at !== i))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
