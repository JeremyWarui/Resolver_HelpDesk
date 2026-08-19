import { useRef, useState, useCallback, DragEvent } from 'react';
import { toast } from 'sonner';
import { X, FileText, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A file the user has picked but not yet sent. The upload happens once,
 *  after the ticket exists, in one request the caller makes — so there is no
 *  per-file progress to report here and this control must not invent one. */
interface UploadFile {
  id: string;
  file: File;
}

interface AttachmentUploaderProps {
  value?: File[];
  onChange?: (files: File[]) => void;
  maxFiles?: number;
  maxSizeMb?: number;
  accept?: string;
  disabled?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface AttachmentRowProps {
  name: string;
  sizeBytes: number;
  onRemove?: () => void;
}

function AttachmentRow({ name, sizeBytes, onRemove }: AttachmentRowProps) {
  return (
    <li className="flex items-start gap-2 rounded-md border px-3 py-2">
      <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{name}</p>
        <p className="text-[10px] text-muted-foreground">{formatBytes(sizeBytes)}</p>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Remove ${name}`}
        >
          <X className="size-3.5" />
        </button>
      )}
    </li>
  );
}

export function AttachmentUploader({
  value,
  onChange,
  maxFiles = 5,
  maxSizeMb = 10,
  accept,
  disabled = false,
}: AttachmentUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  const currentFileCount = value?.length ?? uploadFiles.length;

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const incomingArr = Array.from(incoming);

      if (currentFileCount + incomingArr.length > maxFiles) {
        toast.error(`Maximum ${maxFiles} files allowed`);
        return;
      }

      const oversized = incomingArr.filter((f) => f.size > maxSizeMb * 1024 * 1024);
      if (oversized.length > 0) {
        toast.error(`Files must be smaller than ${maxSizeMb} MB`);
        return;
      }

      const newEntries: UploadFile[] = incomingArr.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
      }));

      setUploadFiles((prev) => {
        const next = [...prev, ...newEntries];
        onChange?.(next.map((u) => u.file));
        return next;
      });

    },
    [currentFileCount, maxFiles, maxSizeMb, onChange],
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      if (disabled) return;
      addFiles(e.dataTransfer.files);
    },
    [disabled, addFiles],
  );

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      addFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleRemoveUpload = (id: string) => {
    setUploadFiles((prev) => {
      const next = prev.filter((f) => f.id !== id);
      onChange?.(next.map((u) => u.file));
      return next;
    });
  };

  const displayFiles = value
    ? value.map<UploadFile>((file, i) => {
        const existing = uploadFiles.find((u) => u.file === file);
        return existing ?? { id: `value-${i}`, file };
      })
    : uploadFiles;

  return (
    <div className="flex flex-col gap-3">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload files"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) inputRef.current?.click(); }}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-6 transition-colors',
          isDragOver
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-accent/50',
          disabled && 'cursor-not-allowed opacity-50',
          !disabled && 'cursor-pointer',
        )}
      >
        <Upload className="size-5 text-muted-foreground" />
        <div className="text-center">
          <p className="text-sm font-medium">
            {isDragOver ? 'Drop files here' : 'Drag & drop or click to browse'}
          </p>
          <p className="text-xs text-muted-foreground">
            Up to {maxFiles} files · max {maxSizeMb} MB each
            {accept ? ` · ${accept}` : ''}
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={handleInputChange}
      />

      {displayFiles.length > 0 && (
        <ul className="flex flex-col gap-2">
          {displayFiles.map((uf) => (
            <AttachmentRow
              key={uf.id}
              name={uf.file.name}
              sizeBytes={uf.file.size}
              onRemove={() => handleRemoveUpload(uf.id)}
            />
          ))}
        </ul>
      )}

    </div>
  );
}
