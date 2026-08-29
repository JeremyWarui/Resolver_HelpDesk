import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { DialogActions } from '@/components/shared/forms/DialogActions';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { updateUser, createUser, createRoleAssignment, getRoleAssignments } from '@/lib/api/users';
import { useCampuses } from '@/hooks/useOrganizations';
import { handleDRFError } from '@/utils/handleDRFError';
import { deriveIdentity } from '@/utils/identity';
import type { User, UserRole, CreateUserPayload } from '@/types';
import { ROLE_LABELS, ROLES_REQUIRING_CAMPUS } from '@/constants/roles';
import { RoleScopeSelectFields } from './RoleScopeSelectFields';

interface UserFormData {
  email: string;
  password: string;
  role: UserRole;
  campus_id: string;
  trade_ids: number[];
  home_campus_id: string;
}

/**
 * Create or edit an account and the one role it holds.
 *
 * The only writer of a role in the frontend, so the Users page and the
 * Technicians page both come through here — a technician created anywhere else
 * would be an account with the title, the dashboard and an empty ticket list.
 */
export function UserFormDialog({
  editing,
  lockRole,
  onSuccess,
  onClose,
}: {
  editing: User | null;
  /** Fix the role, for a page that only ever manages one — the Technicians page. */
  lockRole?: UserRole;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<UserFormData>(() => ({
    email: editing?.email ?? '',
    password: '',
    role: lockRole ?? editing?.role ?? 'user',
    campus_id: editing?.primary_campus_id != null ? String(editing.primary_campus_id) : '',
    trade_ids: [],
    home_campus_id: editing?.home_campus_id != null ? String(editing.home_campus_id) : '',
  }));
  const [saving, setSaving] = useState(false);
  const { campuses } = useCampuses();

  const set = (key: keyof UserFormData, val: string) => setForm(f => ({ ...f, [key]: val }));

  // The role assignment is the only source for a technician's trades — the
  // roster rows are derived from it server-side.
  useEffect(() => {
    if (!editing || form.role !== 'technician') return;
    let active = true;
    getRoleAssignments(editing.id)
      .then(([assignment]) => {
        if (active && assignment) {
          setForm(f => ({ ...f, trade_ids: assignment.trade_ids ?? [] }));
        }
      })
      .catch(() => { /* the dialog still opens; the admin re-picks */ });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  const derived = deriveIdentity(form.email);
  const needsCampus = ROLES_REQUIRING_CAMPUS.includes(form.role);
  const noun = lockRole ? ROLE_LABELS[lockRole].toLowerCase() : 'user';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email.trim()) {
      toast.error('An email address is required');
      return;
    }
    if (!editing && !form.password.trim()) {
      toast.error('A password is required for a new account');
      return;
    }
    if (!form.home_campus_id) {
      toast.error("Select the person's home campus");
      return;
    }
    if (needsCampus && !form.campus_id) {
      toast.error('Select the campus this role covers');
      return;
    }
    if (form.role === 'technician' && form.trade_ids.length === 0) {
      toast.error('Pick at least one trade — a technician with none sees no tickets');
      return;
    }

    setSaving(true);
    try {
      let userId: number;
      if (editing) {
        await updateUser(editing.id, {
          email: form.email.trim(),
          campus_id: Number(form.home_campus_id),
        });
        userId = editing.id;
      } else {
        const payload: CreateUserPayload = {
          email: form.email.trim(),
          password: form.password,
          campus_id: Number(form.home_campus_id),
        };
        userId = (await createUser(payload)).id;
      }

      // Always re-posted rather than diffed: the role write also syncs the
      // technician's trade rows, and those change without the role doing so.
      try {
        const assignment = await createRoleAssignment(userId, {
          role: form.role,
          campus_id: form.campus_id ? Number(form.campus_id) : null,
          trade_ids: form.role === 'technician' ? form.trade_ids : undefined,
        });
        // A supervisor post holds one person, so filling it demoted whoever
        // had it. Warned rather than confirmed: it is a second change the
        // admin did not ask for, and the only other place it shows up is an
        // empty dashboard belonging to somebody who has not been told.
        if (assignment.displaced) {
          toast.warning(
            `${assignment.displaced.full_name} was removed from this post`,
            { description: assignment.displaced.detail, duration: 10000 },
          );
        }
      } catch (roleError) {
        handleDRFError(roleError, {
          fallbackMessage: 'The account was saved, but the role did not stick — reopen this dialog to retry.',
        });
        onSuccess();
        return;
      }

      toast.success(editing ? 'Saved' : `New ${noun} created`);
      onSuccess();
    } catch (error) {
      handleDRFError(error, { fallbackMessage: 'Failed to save the account' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl p-8 max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <ShieldCheck className="h-5 w-5 text-primary" />
            {editing ? `Edit ${noun}` : `Add ${noun}`}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? 'Update the account and the role it holds.'
              : 'Create the account and give it a role.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@ksg.ac.ke" required />
            <p className="text-xs text-muted-foreground">
              {derived
                ? <>They sign in with this address, appear as <span className="font-medium text-foreground">{derived.name}</span>, and take the username <span className="font-mono">{derived.username}</span>.</>
                : <>Name and username come from the part before the @ — jeremy.mwangi@ksg.ac.ke becomes Jeremy Mwangi. Editing the address renames the account.</>}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Home Campus</Label>
            <Select value={form.home_campus_id} onValueChange={v => set('home_campus_id', v)}>
              <SelectTrigger><SelectValue placeholder="Select campus" /></SelectTrigger>
              <SelectContent>
                {campuses.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Where this person is based — it routes the tickets they raise themselves,
              independent of their role.
            </p>
          </div>

          {!editing && (
            <div className="space-y-2">
              <Label>Password</Label>
              <PasswordInput value={form.password} onChange={e => set('password', e.target.value)} placeholder="Minimum 8 characters" required />
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Role &amp; Scope</p>
            <RoleScopeSelectFields
              value={{ role: form.role, campus_id: form.campus_id, trade_ids: form.trade_ids }}
              onChange={next => setForm(f => ({ ...f, ...next }))}
              lockRole={lockRole != null}
            />
          </div>

          <DialogActions
            onCancel={onClose}
            pending={saving}
            submitLabel={editing ? 'Save changes' : 'Create'}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
