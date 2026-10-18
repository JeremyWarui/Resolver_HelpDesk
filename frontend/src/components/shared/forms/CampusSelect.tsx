import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCampuses } from '@/hooks/useOrganizations';

/** A dropdown of every campus, by id as a string. */
export function CampusSelect({ value, onValueChange, id }: {
  value: string;
  onValueChange: (id: string) => void;
  id?: string;
}) {
  const { campuses } = useCampuses();
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id={id}><SelectValue placeholder="Select campus" /></SelectTrigger>
      <SelectContent>
        {campuses.map((c) => (
          <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
