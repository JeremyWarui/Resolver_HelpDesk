// The sortable column header, shared by the ticket columns and the admin
// tables.
//
// Not a hook: it returns a component and is called from plain column
// factories, outside any render. Naming it `use…` would promise rules it does
// not follow.

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
