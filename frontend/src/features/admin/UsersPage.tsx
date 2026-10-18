import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Archive, ArchiveRestore, Pencil, Plus, UserRound, UserX, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { USERS_KEY, useRefreshPeople } from '@/hooks/useRefreshPeople';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { RailEmptyState, RailLayout, type RailGroup } from '@/components/shared/data/RailLayout';
import { deactivateUser, getUsers, reactivateUser } from '@/lib/api/users';
import { useCampuses } from '@/hooks/useOrganizations';
import { handleDRFError } from '@/utils/handleDRFError';
import type { User, UserRole } from '@/types';
import { ROLE_BADGE_STYLES, ROLE_LABELS, ROLE_ORDER } from '@/constants/roles';
import { UserFormDialog } from '@/features/shared/users/UserFormDialog';
import { cn } from '@/lib/utils';
import { Initials } from '@/components/shared/data/Initials';

const ALL = 'all';
const FIX = 'fix';
const INACTIVE = 'inactive';

/** What the fix button on a Needs fixing row says; it opens the edit form either way. */
const FIX_LABEL = { no_home_campus: 'Set home campus', technician_without_trade: 'Set trades' } as const;

const fullName = (u: User) => u.full_name;
const isActive = (u: User) => u.is_active !== false;

function formatJoined(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-KE', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * The account register: a rail of roles with live counts, and each role's
 * people newest first, so a fresh self-registration waiting for a role is on
 * top of the User group.
 *
 * Needs fixing lists accounts that can sign in but will not work: what is
 * wrong comes from the server (`problems`), which the admin's dashboard counts
 * too. An account is deactivated, never deleted, so its history stays; the
 * deactivated are listed apart and can be restored.
 *
 * Campus is the one the person chose at registration (`home_campus`), not the
 * one their role covers: a plain requester's role carries no campus at all.
 */
const UsersPage = () => {
  const usersQuery = useQuery({ queryKey: USERS_KEY, queryFn: getUsers });
  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);
  const refresh = useRefreshPeople();

  useEffect(() => {
    if (usersQuery.error) toast.error('Failed to load users');
  }, [usersQuery.error]);

  const { campuses } = useCampuses();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string>(ALL);
  const [campusFilter, setCampusFilter] = useState(ALL);
  const [formState, setFormState] = useState<{ editing: User | null } | null>(null);
  const [target, setTarget] = useState<User | null>(null);
  const [working, setWorking] = useState(false);

  // Search and campus narrow everything; the rail counts follow them.
  const matching = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(u =>
      (campusFilter === ALL || String(u.home_campus_id) === campusFilter)
      && (!q || `${fullName(u)} ${u.email} ${u.username}`.toLowerCase().includes(q)),
    );
  }, [users, search, campusFilter]);

  const active = useMemo(() => matching.filter(isActive), [matching]);
  const inactive = useMemo(() => matching.filter(u => !isActive(u)), [matching]);
  const toFix = useMemo(() => active.filter(u => (u.problems ?? []).length > 0), [active]);

  const byRole = useMemo(() => ROLE_ORDER.map(role => ({
    role,
    people: (selected === INACTIVE ? inactive : active)
      .filter(u => u.role === role)
      .sort((a, b) => (b.date_joined ?? '').localeCompare(a.date_joined ?? '')),
  })), [active, inactive, selected]);

  const visibleGroups = selected === FIX ? [] : byRole.filter(g =>
    g.people.length > 0 && (selected === ALL || selected === INACTIVE || g.role === selected));
  const visibleCount = selected === FIX ? toFix.length : visibleGroups.reduce((n, g) => n + g.people.length, 0);

  const railGroups: RailGroup[] = [
    { entries: [
      {
        key: ALL,
        icon: <Users className="h-3.5 w-3.5 shrink-0" />,
        label: 'All users',
        count: active.length,
      },
      {
        key: FIX,
        icon: <AlertTriangle className="h-3.5 w-3.5 shrink-0" />,
        label: 'Needs fixing',
        count: toFix.length,
        sub: toFix.length ? `${toFix.length} account${toFix.length === 1 ? '' : 's'}` : 'Nothing to fix',
        alert: toFix.length > 0,
      },
      {
        key: INACTIVE,
        icon: <UserX className="h-3.5 w-3.5 shrink-0" />,
        label: 'Deactivated',
        count: inactive.length,
        sub: inactive.length ? undefined : 'None',
      },
    ] },
    { heading: 'Roles', entries: ROLE_ORDER.map(role => ({
      key: role,
      icon: <UserRound className="h-3.5 w-3.5 shrink-0" />,
      label: ROLE_LABELS[role],
      count: active.filter(u => u.role === role).length,
    })) },
  ];

  const heading = selected === ALL ? 'All users'
    : selected === FIX ? 'Needs fixing'
      : selected === INACTIVE ? 'Deactivated'
        : ROLE_LABELS[selected as UserRole];
  const subheading = selected === FIX
    ? "Accounts that can sign in but whose tickets won't route, or who won't see the right work"
    : `${visibleCount} user${visibleCount === 1 ? '' : 's'}${search ? ' matching your search' : ''}${selected === ALL ? ', newest first in each role' : ''}`;

  const toggleActive = async () => {
    if (!target) return;
    const deactivating = isActive(target);
    setWorking(true);
    try {
      await (deactivating ? deactivateUser(target.id) : reactivateUser(target.id));
      toast.success(deactivating ? `${fullName(target)} deactivated` : `${fullName(target)} restored`);
      setTarget(null);
      refresh();
    } catch (error) {
      handleDRFError(error, { fallbackMessage: deactivating ? 'Failed to deactivate' : 'Failed to restore' });
    } finally {
      setWorking(false);
    }
  };

  return (
    <RailLayout
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search users…"
      loading={usersQuery.isLoading}
      groups={railGroups}
      activeKey={selected}
      onSelect={setSelected}
      noun={{ one: 'user', many: 'users' }}
      emptyLabel="nobody"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b bg-white">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">{heading}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{subheading}</p>
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
            title={search ? 'No users match your search'
              : selected === FIX ? 'Every account works'
                : selected === INACTIVE ? 'Nobody is deactivated'
                  : `No users in ${heading}`}
            hint={search ? 'Try a name, email or username.'
              : selected === FIX ? 'Nobody is missing a home campus, and every technician holds a trade.'
                : selected === INACTIVE ? 'Deactivating someone lists them here, with their history kept.'
                  : 'Add one, or pick another role or campus.'}
          />
        ) : selected === FIX ? (
          <ul className="space-y-2" aria-label="Accounts that need fixing">
            {toFix.map(user => (
              <FixRow key={user.id} user={user} onFix={() => setFormState({ editing: user })} />
            ))}
          </ul>
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
                    onToggleActive={() => setTarget(user)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}

        {selected !== INACTIVE && (
          <p className="text-xs text-gray-500">
            Deactivate, never delete: the person can no longer sign in and drops off every picker,
            but their tickets, comments and history stay. Deactivated accounts can be restored.
          </p>
        )}
      </div>

      {formState && (
        <UserFormDialog
          editing={formState.editing}
          onSuccess={() => setFormState(null)}
          onClose={() => setFormState(null)}
        />
      )}

      <ConfirmDialog
        open={!!target}
        onOpenChange={(o) => { if (!o) setTarget(null); }}
        title={target && isActive(target) ? 'Deactivate this account?' : 'Restore this account?'}
        description={
          target && isActive(target) ? (
            <>
              <strong>{fullName(target)}</strong> ({target.email}) will no longer be able to sign in,
              and leaves any post they hold vacant. Their tickets, comments and history stay, and the
              account can be restored.
            </>
          ) : (
            <>
              <strong>{target && fullName(target)}</strong> will be able to sign in again, with the role
              they had.
            </>
          )
        }
        confirmLabel={target && isActive(target) ? 'Deactivate' : 'Restore'}
        variant={target && isActive(target) ? 'destructive' : 'default'}
        loading={working}
        onConfirm={toggleActive}
      />
    </RailLayout>
  );
};

/** An account that signs in but will not work, with what is wrong and the way to fix it. */
function FixRow({ user, onFix }: { user: User; onFix: () => void }) {
  const name = fullName(user);
  const problems = user.problems ?? [];
  return (
    <li
      aria-label={name}
      className="grid grid-cols-[2rem_minmax(0,1.2fr)_minmax(0,2fr)_auto] items-center gap-4 rounded-lg border border-red-200 bg-white p-3"
    >
      <Initials name={name} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-gray-900">{name}</p>
        <p className="truncate text-xs text-gray-500">{ROLE_LABELS[user.role]} · {user.email}</p>
      </div>
      <div className="min-w-0 space-y-1">
        {problems.map(p => (
          <div key={p.code}>
            <p className="text-sm font-semibold text-red-800">{p.label}</p>
            <p className="text-xs text-gray-600">{p.effect}</p>
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" onClick={onFix}>
        {FIX_LABEL[problems[0].code]}
      </Button>
    </li>
  );
}

/** One account. Fixed widths so the columns line up down the list; narrow
 *  screens drop the rightmost ones rather than wrap. */
function UserRow({ user, onEdit, onToggleActive }: {
  user: User;
  onEdit: () => void;
  onToggleActive: () => void;
}) {
  const name = fullName(user);
  const active = isActive(user);

  return (
    <li
      aria-label={name}
      className={cn('flex items-center gap-3 p-3 bg-white border rounded-lg hover:border-gray-300 transition-colors', !active && 'opacity-75')}
    >
      <Initials name={name} />
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
        {active && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Edit ${name}`}
            onClick={onEdit}
            className="h-7 w-7 p-0 hover:bg-blue-50 text-gray-400 hover:text-blue-600"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          aria-label={active ? `Deactivate ${name}` : `Restore ${name}`}
          title={active ? 'Deactivate' : 'Restore'}
          onClick={onToggleActive}
          className={cn('h-7 w-7 p-0 text-gray-400', active ? 'hover:bg-amber-50 hover:text-amber-700' : 'hover:bg-emerald-50 hover:text-emerald-700')}
        >
          {active ? <Archive className="h-3.5 w-3.5" /> : <ArchiveRestore className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </li>
  );
}

export default UsersPage;
