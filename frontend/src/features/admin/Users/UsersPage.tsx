import { useState, useMemo } from 'react';
import {
  type ColumnDef, type SortingState, type VisibilityState,
  flexRender, getCoreRowModel, getFilteredRowModel,
  getSortedRowModel, useReactTable,
} from '@tanstack/react-table';
import { Users, Pencil, Trash2, ShieldCheck, Plus, ChevronDown, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { deleteUser } from '@/lib/api/users';
import { useCampuses } from '@/hooks/campuses/useCampuses';
import { useDepartments } from '@/hooks/departments/useDepartments';
import { useSortableColumn } from '@/hooks/useSortableColumn';
import { handleDRFError } from '@/utils/handleDRFError';
import type { User, UserRole } from '@/types';
import { ROLE_LABELS, ROLE_BADGE_STYLES, ROLE_ORDER } from './constants';
import { useUsersData } from './useUsersData';
import { UserFormDialog } from './UserFormDialog';
import { RoleAssignmentModal } from './RoleAssignmentModal';

function formatJoinedDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-KE', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

type UserRow = User & { fullName: string; searchField: string };

const UsersPage = () => {
  'use no memo';

  const { users, loading, refresh } = useUsersData();
  const [searchValue, setSearchValue] = useState('');
  // Newest registrations float to the top of each role group by default —
  // the "user" group is where every self-registered account lands, so this
  // is how an admin spots who just signed up and still needs a role.
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date_joined', desc: true }]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [campusFilter, setCampusFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [collapsedRoles, setCollapsedRoles] = useState<Set<UserRole>>(new Set());
  const [formState, setFormState] = useState<{ editing: User | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [roleAssignTarget, setRoleAssignTarget] = useState<User | null>(null);

  const nameHeader = useSortableColumn('Name');
  const emailHeader = useSortableColumn('Email');
  const joinedHeader = useSortableColumn('Joined');

  const { campuses } = useCampuses();
  const { departments } = useDepartments();

  // Departments are org-wide, but each carries the campuses it actually has a
  // CampusDepartment presence on (DepartmentSerializer.campuses) — narrow to those
  // so the Department dropdown only ever offers choices valid for the chosen campus.
  const departmentOptions = useMemo(() => {
    if (campusFilter === 'all') return departments;
    return departments.filter(d => d.campuses?.some(c => String(c.id) === campusFilter));
  }, [departments, campusFilter]);

  const toggleRoleGroup = (role: UserRole) => {
    setCollapsedRoles(prev => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role); else next.add(role);
      return next;
    });
  };

  const scopedUsers = useMemo(() => users.filter(u =>
    (campusFilter === 'all' || String(u.primary_campus_id) === campusFilter)
    && (departmentFilter === 'all' || String(u.primary_department_id) === departmentFilter)
  ), [users, campusFilter, departmentFilter]);

  const data: UserRow[] = useMemo(() => scopedUsers.map(u => ({
    ...u,
    fullName: `${u.first_name} ${u.last_name}`.trim() || u.username,
    searchField: `${u.first_name} ${u.last_name} ${u.email} ${u.username} ${u.role}`.toLowerCase(),
  })), [scopedUsers]);

  const columns: ColumnDef<UserRow>[] = [
    {
      accessorKey: 'id',
      header: 'ID',
      cell: ({ row }) => <span className="text-xs font-mono text-gray-500">{row.getValue('id')}</span>,
    },
    {
      accessorKey: 'fullName',
      header: nameHeader,
      cell: ({ row }) => <span className="font-medium text-sm">{row.getValue('fullName') as string}</span>,
    },
    {
      accessorKey: 'username',
      header: 'Username',
      cell: ({ row }) => <span className="text-sm text-gray-500">@{row.getValue('username')}</span>,
    },
    {
      accessorKey: 'email',
      header: emailHeader,
      cell: ({ row }) => <span className="text-sm">{row.getValue('email')}</span>,
    },
    {
      accessorKey: 'date_joined',
      header: joinedHeader,
      cell: ({ row }) => <span className="text-sm text-gray-500">{formatJoinedDate(row.getValue('date_joined'))}</span>,
    },
    {
      accessorKey: 'campus_name',
      header: 'Campus',
      cell: ({ row }) => <span className="text-sm text-gray-600">{(row.getValue('campus_name') as string | null) ?? '—'}</span>,
    },
    {
      accessorKey: 'primary_department_name',
      header: 'Department',
      cell: ({ row }) => <span className="text-sm text-gray-600">{(row.getValue('primary_department_name') as string | null | undefined) ?? '—'}</span>,
    },
    {
      accessorKey: 'section_names',
      header: 'Section',
      cell: ({ row }) => {
        const names = row.original.section_names ?? [];
        if (names.length === 0) return <span className="text-gray-400 text-sm">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {names.slice(0, 2).map((n, i) => (
              <Badge key={i} variant="outline" className="text-xs">{n}</Badge>
            ))}
            {names.length > 2 && <Badge variant="outline" className="text-xs">+{names.length - 2}</Badge>}
          </div>
        );
      },
    },
    {
      accessorKey: 'searchField',
      header: () => null,
      cell: () => null,
      filterFn: 'includesString',
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const user = row.original;
        return (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setFormState({ editing: user })} title="Edit user">
              <Pencil className="h-3.5 w-3.5 text-gray-500" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-primary hover:text-primary/80"
              onClick={() => setRoleAssignTarget(user)}
              title="Manage role assignments"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
              onClick={() => setDeleteTarget(user)}
              title="Delete user"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      },
    },
  ];

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnVisibility: { ...columnVisibility, searchField: false },
    },
  });

  // Grouped by role rather than paginated — role is the natural first thing an
  // admin scopes by here, and splitting a role's members across pages would make
  // each group's count badge lie about how many people are actually in it.
  const visibleColumnCount = table.getVisibleLeafColumns().length;
  const sortedFilteredRows = table.getRowModel().rows;
  const roleGroups = ROLE_ORDER
    .map(role => ({ role, rows: sortedFilteredRows.filter(row => row.original.role === role) }))
    .filter(group => group.rows.length > 0);

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
    <>
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
        <Card className="w-full">
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <CardTitle className="flex items-center">
              <Users className="h-6 w-6 mr-2" />
              Users
            </CardTitle>
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90 flex items-center gap-1"
              onClick={() => setFormState({ editing: null })}
            >
              <Plus className="h-4 w-4" />
              Add User
            </Button>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3 items-center py-2">
              <Input
                placeholder="Search..."
                value={searchValue}
                onChange={(e) => {
                  setSearchValue(e.target.value);
                  table.getColumn('searchField')?.setFilterValue(e.target.value.toLowerCase());
                }}
                className="max-w-sm"
              />

              <Select value={campusFilter} onValueChange={(v) => setCampusFilter(v)}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Campuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Campuses</SelectItem>
                  {campuses.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={departmentFilter} onValueChange={(v) => setDepartmentFilter(v)}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departmentOptions.map(d => (
                    <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {(campusFilter !== 'all' || departmentFilter !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-primary hover:text-primary/80"
                  onClick={() => { setCampusFilter('all'); setDepartmentFilter('all'); }}
                >
                  Clear filters
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="ml-auto">
                    <SlidersHorizontal className="mr-2 h-4 w-4" />
                    Columns
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {table.getAllColumns()
                    .filter((c) => c.id !== 'actions' && c.id !== 'searchField')
                    .map((col) => (
                      <DropdownMenuCheckboxItem
                        key={col.id}
                        className="capitalize"
                        checked={col.getIsVisible()}
                        onCheckedChange={(v) => col.toggleVisibility(!!v)}
                      >
                        {col.id}
                      </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="text-sm text-muted-foreground pb-2">
              {loading ? 'Loading…' : `Showing ${data.length} of ${users.length} users`}
            </div>

            <div className="rounded-sm border">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((hg) => (
                    <TableRow key={hg.id}>
                      {hg.headers.map((h) => (
                        <TableHead key={h.id}>
                          {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={visibleColumnCount} className="h-24 text-center">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : roleGroups.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={visibleColumnCount} className="h-24 text-center">
                        No users found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    roleGroups.flatMap(({ role, rows }) => {
                      const collapsed = collapsedRoles.has(role);
                      const groupHeader = (
                        <TableRow key={`group-${role}`} className="bg-gray-50 hover:bg-gray-50">
                          <TableCell colSpan={visibleColumnCount} className="py-2">
                            <button
                              type="button"
                              onClick={() => toggleRoleGroup(role)}
                              className="flex items-center gap-2 text-left"
                            >
                              {collapsed ? (
                                <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                              )}
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE_STYLES[role] ?? 'bg-gray-100 text-gray-600'}`}>
                                {ROLE_LABELS[role] ?? role}
                              </span>
                              <span className="text-xs text-muted-foreground">{rows.length}</span>
                            </button>
                          </TableCell>
                        </TableRow>
                      );
                      const dataRows = collapsed ? [] : rows.map((row) => (
                        <TableRow key={row.id}>
                          {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          ))}
                        </TableRow>
                      ));
                      return [groupHeader, ...dataRows];
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Dialog — mounted only while open */}
      {formState && (
        <UserFormDialog
          editing={formState.editing}
          onSuccess={() => { setFormState(null); refresh(); }}
          onClose={() => setFormState(null)}
        />
      )}

      {/* Role Assignment Modal */}
      {roleAssignTarget && (
        <RoleAssignmentModal
          user={roleAssignTarget}
          onClose={() => { setRoleAssignTarget(null); refresh(); }}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>"{deleteTarget?.first_name} {deleteTarget?.last_name}"</strong> ({deleteTarget?.email}) will be permanently deleted.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 gap-2"
            >
              {deleting && <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default UsersPage;
