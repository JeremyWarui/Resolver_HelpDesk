import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelectCheckboxGroup } from '@/components/shared/forms/MultiSelectCheckboxGroup';
import { useCampuses } from '@/hooks/useOrganizations';
import { useTrades } from '@/hooks/useCatalogue';
import type { UserRole } from '@/types';
import { ROLE_LABELS, ROLES_REQUIRING_CAMPUS, type RoleScopeValue } from '@/constants/roles';

/**
 * Role, and the scope that role carries. The one control both the user dialog
 * and the technician form post through, so neither can drift from what
 * `accounts.posts.assign_role` accepts.
 *
 * A technician, an HOS and an HOD are scoped to one campus; an admin and a
 * manager see every campus and a plain requester is reached through their own
 * tickets, so neither takes one. A technician also names their trades: campus
 * and trade are the pair `scoped_ticket_qs` matches on, and one without the
 * other is an account that can see nothing.
 */
export function RoleScopeSelectFields({
  value,
  onChange,
  lockRole = false,
}: {
  value: RoleScopeValue;
  onChange: (next: RoleScopeValue) => void;
  /** Fix the role — the technician form only ever creates technicians. */
  lockRole?: boolean;
}) {
  const { role, campus_id, trade_ids } = value;
  const { campuses } = useCampuses();
  const { trades } = useTrades();

  const needsCampus = ROLES_REQUIRING_CAMPUS.includes(role);
  const needsTrades = role === 'technician';

  return (
    <>
      {!lockRole && (
        <div className="space-y-1.5">
          <Label>Role</Label>
          <Select
            value={role}
            onValueChange={v => onChange({ role: v as UserRole, campus_id: '', trade_ids: [] })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(ROLE_LABELS) as UserRole[]).map(r => (
                <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {needsCampus && (
        <div className="space-y-1.5">
          <Label>Campus</Label>
          <Select value={campus_id} onValueChange={v => onChange({ ...value, campus_id: v })}>
            <SelectTrigger><SelectValue placeholder="Select campus" /></SelectTrigger>
            <SelectContent>
              {campuses.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            The campus this role covers — not necessarily where the person is based.
          </p>
        </div>
      )}

      {needsTrades && (
        <div className="space-y-1.5">
          <Label>Trades</Label>
          <MultiSelectCheckboxGroup
            options={trades.map(t => ({ value: t.id, label: t.name }))}
            selected={trade_ids}
            onChange={next => onChange({ ...value, trade_ids: next })}
            emptyMessage="No trades in the catalogue yet."
          />
          <p className="text-xs text-muted-foreground">
            At least one. A technician sees a ticket only where the campus and the
            trade both line up.
          </p>
        </div>
      )}
    </>
  );
}
