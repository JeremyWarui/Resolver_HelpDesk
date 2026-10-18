import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** The Edit and Delete icon buttons at the end of a register row, named for screen readers. */
export function RowActions({ name, onEdit, onDelete }: {
  name: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Edit ${name}`}
        onClick={onEdit}
        className="h-7 w-7 p-0 hover:bg-blue-50 text-gray-400 hover:text-blue-600"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Delete ${name}`}
        onClick={onDelete}
        className="h-7 w-7 p-0 hover:bg-red-50 text-gray-400 hover:text-red-600"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </>
  );
}
