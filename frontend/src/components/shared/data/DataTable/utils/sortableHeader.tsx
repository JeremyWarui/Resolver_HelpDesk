// The sortable column header. Five columns in TableUtils inlined this same
// ten-line block while this file already existed and three admin pages already
// used it — TableUtils simply predates it.
//
// Not a hook, despite the old name `useSortableColumn`: it returns a component
// and is called from plain column factories, which only worked because it obeys
// no rules of hooks.

import type React from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function sortableHeader(label: string): React.FC<{ column: { toggleSorting: () => void } }> {
  return ({ column }: { column: { toggleSorting: () => void } }) => (
    <div className="flex items-center space-x-1">
      <span>{label}</span>
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting()}
        className="p-0 h-4 w-4"
      >
        <ChevronDown className="h-3 w-3" />
      </Button>
    </div>
  );
}
