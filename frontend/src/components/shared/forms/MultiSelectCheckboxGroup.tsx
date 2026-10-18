import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface MultiSelectOption {
  value: number;
  label: string;
}

/** A checkbox-group multi-select over numeric ids. Built on the shadcn
 *  Checkbox primitive, so focus and disabled states match every other
 *  control on the form. */
export function MultiSelectCheckboxGroup({
  options,
  selected,
  onChange,
  disabled,
  className,
  emptyMessage = 'No options available.',
}: {
  options: MultiSelectOption[];
  selected: number[];
  onChange: (next: number[]) => void;
  disabled?: boolean;
  className?: string;
  emptyMessage?: string;
}) {
  if (options.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className={cn('space-y-2 rounded-md border p-3', className)}>
      {options.map((opt) => {
        const checked = selected.includes(opt.value);
        const id = `mscg-${opt.value}`;
        return (
          <div key={opt.value} className="flex items-center gap-2">
            <Checkbox
              id={id}
              checked={checked}
              disabled={disabled}
              onCheckedChange={(next) => {
                onChange(
                  next
                    ? [...selected, opt.value]
                    : selected.filter((v) => v !== opt.value)
                );
              }}
            />
            <Label htmlFor={id} className="text-sm font-normal cursor-pointer">
              {opt.label}
            </Label>
          </div>
        );
      })}
    </div>
  );
}
