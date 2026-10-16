import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, UserRound, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { RailEmptyState, RailLayout, type RailGroup } from '@/components/shared/data/RailLayout';
import { deleteUser, getUsers } from '@/lib/api/users';
import { useCampuses } from '@/hooks/useOrganizations';
import { handleDRFError } from '@/utils/handleDRFError';
import type { User, UserRole } from '@/types';
import { ROLE_BADGE_STYLES, ROLE_LABELS, ROLE_ORDER } from '@/constants/roles';
import { UserFormDialog } from '@/features/shared/users/UserFormDialog';
import { cn } from '@/lib/utils';

const USERS_KEY = ['admin', 'users'] as const;
const ALL = 'all';

const fullName = (u: User) => `${u.first_name} ${u.last_name}`.trim() || u.username;

function formatJoined(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-KE', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * The account register: a rail of roles with live counts, and each role's
 * people newest first, so a fresh self-registration waiting for a role is on
 * top of the User group.
 *
 * Campus is the one the person chose at registration (`home_campus`), not the
 * one their role covers: a plain requester's role carries no campus at all.
 */
const UsersPage = () => {
  const queryClient = useQueryClient();
  const usersQuery = useQuery({ queryKey: USERS_KEY, queryFn: getUsers });
  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: USERS_KEY });

  useEffect(() => {
    if (usersQuery.error) toast.error('Failed to load users');
  }, [usersQuery.error]);

  const { campuses } = useCampuses();
  const [search, setSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>(ALL);
  const [campusFilter, setCampusFilter] = useState(ALL);
  const [formState, setFormState] = useState<{ editing: User | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Search and campus narrow everything; the rail counts follow them.
  const matching = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(u =>
      (campusFilter === ALL || String(u.home_campus_id) === campusFilter)
      && (!q || `${fullName(u)} ${u.email} ${u.username}`.toLowerCase().includes(q)),
    );
  }, [users, search, campusFilter]);

  const byRole = useMemo(() => ROLE_ORDER.map(role => ({
    role,
    people: matching
      .filter(u => u.role === role)
      .sort((a, b) => (b.date_joined ?? '').localeCompare(a.date_joined ?? '')),
  })), [matching]);

  const visibleGroups = byRole.filter(g =>
    g.people.length > 0 && (selectedRole === ALL || g.role === selectedRole));
  const visibleCount = visibleGroups.reduce((n, g) => n + g.people.length, 0);

  const railGroups: RailGroup[] = [
    { entries: [{
      key: ALL,
      icon: <Users className="h-3.5 w-3.5 shrink-0" />,
      label: 'All users',
      count: matching.length,
    }] },
    { heading: 'Roles', entries: byRole.map(({ role, people }) => ({
      key: role,
      icon: <UserRound className="h-3.5 w-3.5 shrink-0" />,
      label: ROLE_LABELS[role],
      count: people.length,
    })) },
  ];

  const heading = selectedRole === ALL ? 'All users' : ROLE_LABELS[selectedRole as UserRole];

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteUser(deleteTarget.id);
      toast.success('User deleted');
      setDeleteTarget(null);
      refresh();
    } catch (error) {
      handleDRFError(error, { fallbackMessage: 'Failed to delete user' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <RailLayout
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search users…"
      loading={usersQuery.isLoading}
      groups={railGroups}
      activeKey={selectedRole}
      onSelect={setSelectedRole}
      noun={{ one: 'user', many: 'users' }}
      emptyLabel="nobody"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b bg-white">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">{heading}</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {visibleCount} user{visibleCount === 1 ? '' : 's'}
            {search && ' matching your search'}
            {selectedRole === ALL && ', newest first in each role'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select value={campusFilter} onValueChange={setCampusFilter}>
            <SelectTrigger className="h-8 w-40 text-sm" aria-label="Campus">
              <SelectValue placeholder="All campuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All campuses</SelectItem>
              {campuses.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="brand" className="gap-1.5" onClick={() => setFormState({ editing: null })}>
            <Plus className="h-4 w-4" />
            Add User
          </Button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {usersQuery.isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : visibleCount === 0 ? (
          <RailEmptyState
            icon={<Users className="h-10 w-10" />}
            title={search ? 'No users match your search' : `No users in ${heading}`}
            hint={search ? 'Try a name, email or username.' : 'Add one, or pick another role or campus.'}
          />
        ) : (
          visibleGroups.map(({ role, people }) => (
            <section key={role} aria-label={ROLE_LABELS[role]}>
              <div className="flex items-center gap-2 mb-2">
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', ROLE_BADGE_STYLES[role])}>
                  {ROLE_LABELS[role]}
                </span>
                <span className="text-xs text-gray-400">{people.length}</span>
              </div>
              <ul className="space-y-1.5">
                {people.map(user => (
                  <UserRow
                    key={user.id}
                    user={user}
                    onEdit={() => setFormState({ editing: user })}
                    onDelete={() => setDeleteTarget(user)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      {formState && (
        <UserFormDialog
          editing={formState.editing}
          onSuccess={() => { setFormState(null); refresh(); }}
          onClose={() => setFormState(null)}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title="Delete User?"
        description={
          <>
            <strong>"{deleteTarget && fullName(deleteTarget)}"</strong>{' '}
            ({deleteTarget?.email}) will be permanently deleted. This action cannot be undone.
          </>
        }
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDeleteConfirm}
      />
    </RailLayout>
  );
};

/** One account. Fixed widths so the columns line up down the list; narrow
 *  screens drop the rightmost ones rather than wrap. */
function UserRow({ user, onEdit, onDelete }: {
  user: User;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const name = fullName(user);
  const initials = name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

  return (
    <li
      aria-label={name}
      className="flex items-center gap-3 p-3 bg-white border rounded-lg hover:border-gray-300 transition-colors"
    >
      <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
        {initials || '?'}
      </div>
      <div className="w-56 shrink-0 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
        <p className="text-xs text-gray-400 truncate md:hidden">{user.email}</p>
      </div>
      <span className="hidden md:block flex-1 min-w-0 truncate text-sm text-gray-600">{user.email}</span>
      <span className="hidden lg:block w-28 shrink-0 truncate text-sm text-gray-600">
        {user.home_campus_name ?? '—'}
      </span>
      <span className="hidden xl:block w-28 shrink-0 text-xs text-gray-400 tabular-nums">
        {formatJoined(user.date_joined)}
      </span>
      <div className="flex gap-0.5 shrink-0 ml-auto">
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
      </div>
    </li>
  );
}

export default UsersPage;
