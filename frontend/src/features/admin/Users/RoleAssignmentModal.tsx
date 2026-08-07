import { useState, useEffect } from 'react';
import { ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { getRoleAssignments, createRoleAssignment, deleteRoleAssignment } from '@/lib/api/users';
import { handleDRFError } from '@/utils/handleDRFError';
import type { User, UserRole, RoleAssignment, CreateRoleAssignmentPayload } from '@/types';
import { ROLE_LABELS, ROLE_BADGE_STYLES } from './constants';
import { RoleScopeSelectFields } from './RoleScopeSelectFields';

interface RoleAssignFormState {
  role: UserRole;
  campus_id: string;
  department_id: string;
  section_id: string;
  valid_until: string;
}

const EMPTY_RA_FORM: RoleAssignFormState = {
  role: 'user',
  campus_id: '',
  department_id: '',
  section_id: '',
  valid_until: '',
};

export function RoleAssignmentModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [assignments, setAssignments] = useState<RoleAssignment[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [form, setForm] = useState<RoleAssignFormState>(EMPTY_RA_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchAssignments = async () => {
    setLoadingList(true);
    try {
      setAssignments(await getRoleAssignments(user.id));
    } catch {
      toast.error('Failed to load role assignments');
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.valid_until) {
      toast.error('Set an end date — cover assignments must be time-boxed');
      return;
    }
    setSubmitting(true);
    try {
      const payload: CreateRoleAssignmentPayload = {
        role: form.role,
        is_primary: false,
        campus_id: form.campus_id ? Number(form.campus_id) : null,
        department_id: form.department_id ? Number(form.department_id) : null,
        section_id: form.section_id ? Number(form.section_id) : null,
        valid_until: new Date(form.valid_until).toISOString(),
      };
      await createRoleAssignment(user.id, payload);
      toast.success('Cover assignment added');
      // C-1 guard: a cover is NOT a promotion — if the admin meant to change
      // the user's standing role, this is the moment to catch the mistake.
      const primary = assignments.find(a => a.is_primary);
      if (primary && primary.role !== form.role) {
        toast.warning(
          `This is a temporary cover only — ${user.first_name}'s primary role is still ` +
          `${ROLE_LABELS[primary.role] ?? primary.role}. Use Edit User to promote them permanently.`,
          { duration: 8000 },
        );
      }
      setForm(EMPTY_RA_FORM);
      fetchAssignments();
    } catch (error) {
      handleDRFError(error, { fallbackMessage: 'Failed to add role assignment' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (ra: RoleAssignment) => {
    setDeletingId(ra.id);
    try {
      await deleteRoleAssignment(user.id, ra.id);
      toast.success('Role assignment removed');
      fetchAssignments();
    } catch (error: unknown) {
      const axiosError = error as { response?: { status?: number; data?: { detail?: string } } };
      if (axiosError?.response?.status === 422 || axiosError?.response?.status === 400) {
        toast.error(axiosError.response?.data?.detail ?? 'Cannot delete this assignment.');
      } else {
        handleDRFError(error, { fallbackMessage: 'Failed to remove role assignment' });
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Role Assignments — {user.first_name} {user.last_name}
          </DialogTitle>
          <DialogDescription>
            View or remove assignments, and add a time-boxed cover role. To change this
            user's primary role, use Edit User instead.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Current assignments */}
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Current Assignments</p>
            {loadingList ? (
              <div className="space-y-2">
                {[1, 2].map(i => <Skeleton key={i} className="h-9 w-full rounded-md" />)}
              </div>
            ) : assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No role assignments yet.</p>
            ) : (
              <ul className="space-y-2">
                {assignments.map(ra => (
                  <li key={ra.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE_STYLES[ra.role] ?? 'bg-gray-100 text-gray-600'}`}>
                      {ROLE_LABELS[ra.role] ?? ra.role}
                    </span>
                    <span className="flex-1 text-muted-foreground truncate">
                      {[ra.campus_name, ra.department_name, ra.section_name].filter(Boolean).join(' / ') || 'Global'}
                    </span>
                    {ra.is_primary ? (
                      <Badge variant="outline" className="text-xs shrink-0 border-primary text-primary">Primary</Badge>
                    ) : ra.valid_until ? (
                      <Badge variant="outline" className="text-xs shrink-0 text-muted-foreground">
                        Until {new Date(ra.valid_until).toLocaleDateString()}
                      </Badge>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 shrink-0 text-red-400 hover:text-red-600 disabled:opacity-40"
                      disabled={ra.is_primary || deletingId === ra.id}
                      onClick={() => handleDelete(ra)}
                      title={ra.is_primary ? 'Cannot delete primary assignment' : 'Remove assignment'}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Separator />

          {/* Add cover assignment form */}
          <div>
            <p className="text-sm font-medium text-foreground mb-3">Add Cover Assignment</p>
            <form onSubmit={handleAdd} className="space-y-3">
              <RoleScopeSelectFields
                value={{ role: form.role, campus_id: form.campus_id, department_id: form.department_id, section_id: form.section_id }}
                onChange={next => setForm(f => ({ ...f, ...next }))}
                compact
              />

              <div className="space-y-1.5">
                <Label className="text-xs">Ends on</Label>
                <Input
                  type="date"
                  className="h-8 text-sm"
                  value={form.valid_until}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))}
                  required
                />
              </div>

              <div className="flex justify-end pt-1">
                <Button type="submit" size="sm" disabled={submitting} className="bg-primary hover:bg-primary/90">
                  {submitting ? 'Adding…' : 'Add Cover Assignment'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
