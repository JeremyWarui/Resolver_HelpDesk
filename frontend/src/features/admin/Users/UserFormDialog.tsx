import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { updateUser, createUser, createRoleAssignment } from '@/lib/api/users';
import { useCampuses } from '@/hooks/campuses/useCampuses';
import { handleDRFError } from '@/utils/handleDRFError';
import type { User, UserRole, CreateUserPayload } from '@/types';
import {
  ROLES_REQUIRING_SECTION,
  ROLES_REQUIRING_CAMPUS_DEPT,
  ROLES_REQUIRING_DEPARTMENT,
} from './constants';
import { RoleScopeSelectFields } from './RoleScopeSelectFields';

interface UserFormData {
  first_name: string;
  last_name: string;
  email: string;
  username: string;
  password: string;
  role: UserRole;
  campus_id: string;
  department_id: string;
  section_id: string;
  home_campus_id: string;
}

const EMPTY_FORM: UserFormData = {
  first_name: '',
  last_name: '',
  email: '',
  username: '',
  password: '',
  role: 'user',
  campus_id: '',
  department_id: '',
  section_id: '',
  home_campus_id: '',
};

function roleScopeFromUser(u: User | null): Pick<UserFormData, 'role' | 'campus_id' | 'department_id' | 'section_id'> {
  if (!u) return { role: 'user', campus_id: '', department_id: '', section_id: '' };
  return {
    role: u.role,
    campus_id: u.primary_campus_id != null ? String(u.primary_campus_id) : '',
    department_id: u.primary_department_id != null ? String(u.primary_department_id) : '',
    section_id: u.sections?.[0] != null ? String(u.sections[0]) : '',
  };
}

function buildForm(editing: User | null): UserFormData {
  return editing
    ? {
        ...EMPTY_FORM,
        first_name: editing.first_name,
        last_name: editing.last_name,
        email: editing.email,
        username: editing.username,
        home_campus_id: editing.home_campus_id != null ? String(editing.home_campus_id) : '',
        ...roleScopeFromUser(editing),
      }
    : EMPTY_FORM;
}

// Mounted only while open (parent conditionally renders), so the form state
// initializes from `editing` on mount — no prev-prop mirroring needed.
export function UserFormDialog({
  editing,
  onSuccess,
  onClose,
}: {
  editing: User | null;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<UserFormData>(() => buildForm(editing));
  const [saving, setSaving] = useState(false);
  const { campuses: homeCampuses } = useCampuses();

  const set = (key: keyof UserFormData, val: string) => setForm(f => ({ ...f, [key]: val }));

  const needsSection = ROLES_REQUIRING_SECTION.includes(form.role);
  const needsCampusDept = ROLES_REQUIRING_CAMPUS_DEPT.includes(form.role);
  const needsDepartment = ROLES_REQUIRING_DEPARTMENT.includes(form.role);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim()) {
      toast.error('First name, last name and email are required');
      return;
    }
    if (!editing && !form.password.trim()) {
      toast.error('Password is required for new users');
      return;
    }
    if (!form.home_campus_id) {
      toast.error("Select the user's home campus");
      return;
    }

    const initialScope = roleScopeFromUser(editing);
    const roleChanged = editing
      ? form.role !== initialScope.role
        || form.campus_id !== initialScope.campus_id
        || form.department_id !== initialScope.department_id
        || form.section_id !== initialScope.section_id
      : form.role !== 'user';

    if (roleChanged) {
      if (needsSection && !form.section_id) {
        toast.error('Select a section for this role');
        return;
      }
      if (needsCampusDept && (!form.campus_id || !form.department_id)) {
        toast.error('Select a campus and department for this role');
        return;
      }
      if (needsDepartment && !form.department_id) {
        toast.error('Select a department for this role');
        return;
      }
    }

    setSaving(true);
    try {
      let userId: number;
      if (editing) {
        await updateUser(editing.id, {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          campus_id: Number(form.home_campus_id),
        });
        userId = editing.id;
      } else {
        const payload: CreateUserPayload = {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          password: form.password,
          campus_id: Number(form.home_campus_id),
          ...(form.username.trim() ? { username: form.username.trim() } : {}),
        };
        const created = await createUser(payload);
        userId = created.id;
      }

      if (roleChanged) {
        try {
          await createRoleAssignment(userId, {
            role: form.role,
            is_primary: true,
            campus_id: form.campus_id ? Number(form.campus_id) : null,
            department_id: form.department_id ? Number(form.department_id) : null,
            section_id: form.section_id ? Number(form.section_id) : null,
          });
        } catch (roleError) {
          handleDRFError(roleError, { fallbackMessage: 'User saved, but the role update failed — use the role assignment button to fix it.' });
          onSuccess();
          return;
        }
      }

      toast.success(editing ? 'User updated' : 'User created');
      onSuccess();
    } catch (error) {
      handleDRFError(error, { fallbackMessage: 'Failed to save user' });
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
            {editing ? 'Edit User' : 'Add User'}
          </DialogTitle>
          <DialogDescription>
            {editing ? 'Update user details, account information, and role.' : 'Create a new user account and optionally assign a role.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>First Name</Label>
              <Input value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="First name" required />
            </div>
            <div className="space-y-2">
              <Label>Last Name</Label>
              <Input value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Last name" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="user@example.com" required />
          </div>
          <div className="space-y-2">
            <Label>Home Campus</Label>
            <Select value={form.home_campus_id} onValueChange={v => set('home_campus_id', v)}>
              <SelectTrigger><SelectValue placeholder="Select campus" /></SelectTrigger>
              <SelectContent>
                {homeCampuses.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Where this person is based — used to route tickets they raise themselves, independent of their role.</p>
          </div>
          {!editing && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Username <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input value={form.username} onChange={e => set('username', e.target.value)} placeholder="e.g. john.doe" />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <PasswordInput value={form.password} onChange={e => set('password', e.target.value)} placeholder="Minimum 8 characters" required />
              </div>
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Role &amp; Scope</p>
            <div className="grid grid-cols-2 gap-4">
              <RoleScopeSelectFields
                value={{ role: form.role, campus_id: form.campus_id, department_id: form.department_id, section_id: form.section_id }}
                onChange={next => setForm(f => ({ ...f, ...next }))}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90">
              {saving ? 'Saving…' : editing ? 'Update' : 'Create User'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
