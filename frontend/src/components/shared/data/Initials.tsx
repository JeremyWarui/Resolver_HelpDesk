import { initials } from '@/utils/identity';

/** A person's initials in a small round badge, at the start of a register row. */
export function Initials({ name }: { name: string }) {
  return (
    <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
      {initials(name)}
    </div>
  );
}
