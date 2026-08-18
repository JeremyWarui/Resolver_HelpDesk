/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { getPermissions } from './permissions';
import type { PermissionMap, UserScope } from '@/types';
import type { UserRole } from '@/types';

interface RoleContextValue {
  role: UserRole | null;
  permissions: PermissionMap | null;
  scope: UserScope | null;
  isRole: (...roles: UserRole[]) => boolean;
}

const RoleContext = createContext<RoleContextValue>({
  role: null,
  permissions: null,
  scope: null,
  isRole: () => false,
});

export function RoleProvider({ children }: { children: React.ReactNode }) {
  // The auth store hydrates synchronously from localStorage at module load,
  // so an existing session's role/permissions are available on first render.
  const user = useAuthStore((s) => s.user);

  const value = useMemo<RoleContextValue>(() => {
    if (!user) {
      return { role: null, permissions: null, scope: null, isRole: () => false };
    }

    const role = user.role;
    const permissions = getPermissions(role);
    const scope: UserScope = {
      userId: user.id,
      role,
      campusId: user.primary_campus_id ?? null,
      departmentId: user.primary_department_id ?? null,
      sectionIds: user.sections ?? [],
    };

    return {
      role,
      permissions,
      scope,
      isRole: (...roles) => roles.includes(role),
    };
  }, [user]);

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRoleContext(): RoleContextValue {
  return useContext(RoleContext);
}

export function usePermissions(): PermissionMap {
  const { permissions } = useRoleContext();
  return (
    permissions ?? {
      canCreateTicket: false,
      canAssignTicket: false,
      canReassignTicket: false,
      canUpdateTicketStatus: false,
      canCloseTicket: false,
      canReopenTicket: false,
      canRateTicket: false,
      canViewDeptQueue: false,
      canViewOrgAnalytics: false,
      canViewSLATracking: false,
      canExportReports: false,
      canConfigureSystem: false,
      canManageUsers: false,
    }
  );
}

