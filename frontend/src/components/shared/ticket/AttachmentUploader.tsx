import { useRef, useState, useCallback, DragEvent } from 'react';
import { toast } from 'sonner';
import { X, FileText, AlertCircle, ExternalLink, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

interface UploadFile {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
}

interface ExistingAttachment {
  id: string;
  filename: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
}

interface AttachmentUploaderProps {
  value?: File[];
  onChange?: (files: File[]) => void;
  existingAttachments?: ExistingAttachment[];
  onRemoveExisting?: (id: string) => void;
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

function simulateProgress(
  id: string,
  setFiles: React.Dispatch<React.SetStateAction<UploadFile[]>>,
) {
  let current = 0;
  const step = () => {
    current = Math.min(current + Math.random() * 25 + 10, 100);
    setFiles((prev) =>
      prev.map((f) =>
        f.id === id
          ? { ...f, progress: Math.round(current), status: current >= 100 ? 'done' : 'uploading' }
          : f,
      ),
    );
    if (current < 100) {
      setTimeout(step, 200 + Math.random() * 150);
    }
  };
  setTimeout(step, 100);
}

interface AttachmentRowProps {
  name: string;
  sizeBytes: number;
  isError?: boolean;
  href?: string;
  extra?: React.ReactNode;
  onRemove?: () => void;
}

function AttachmentRow({ name, sizeBytes, isError, href, extra, onRemove }: AttachmentRowProps) {
  return (
    <li
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2',
        isError && 'border-destructive bg-destructive/5',
      )}
    >
      {isError ? (
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
      ) : (
        <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{name}</p>
        <p className="text-[10px] text-muted-foreground">{formatBytes(sizeBytes)}</p>
        {extra}
      </div>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
          aria-label={`Open ${name}`}
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="size-3.5" />
        </a>
      )}
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
  existingAttachments = [],
  onRemoveExisting,
  maxFiles = 5,
  maxSizeMb = 10,
  accept,
  disabled = false,
}: AttachmentUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  const currentFileCount = (value?.length ?? uploadFiles.length) + existingAttachments.length;

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
        progress: 0,
        status: 'pending',
      }));

      setUploadFiles((prev) => {
        const next = [...prev, ...newEntries];
        onChange?.(next.map((u) => u.file));
        return next;
      });

      newEntries.forEach((entry) => simulateProgress(entry.id, setUploadFiles));
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
        return existing ?? { id: `value-${i}`, file, progress: 100, status: 'done' };
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
              isError={uf.status === 'error'}
              extra={
                uf.status !== 'done' && uf.status !== 'error' ? (
                  <Progress value={uf.progress} className="mt-1 h-1" />
                ) : uf.status === 'error' ? (
                  <p className="text-[10px] text-destructive">Upload failed</p>
                ) : null
              }
              onRemove={() => handleRemoveUpload(uf.id)}
            />
          ))}
        </ul>
      )}

      {existingAttachments.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">Existing attachments</p>
          <ul className="flex flex-col gap-1.5">
            {existingAttachments.map((att) => (
              <AttachmentRow
                key={att.id}
                name={att.filename}
                sizeBytes={att.sizeBytes}
                href={att.url}
                onRemove={onRemoveExisting ? () => onRemoveExisting(att.id) : undefined}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
