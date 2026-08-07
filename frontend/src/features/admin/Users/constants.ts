import type { UserRole } from '@/types';

export const ROLE_LABELS: Record<UserRole, string> = {
  user: 'User',
  technician: 'Technician',
  hos: 'Head of Section',
  hod: 'Head of Department',
  manager: 'Manager',
  admin: 'Admin',
};

export const ROLE_BADGE_STYLES: Record<UserRole, string> = {
  user: 'bg-gray-100 text-gray-600',
  technician: 'bg-blue-100 text-blue-700',
  hos: 'bg-purple-100 text-purple-700',
  hod: 'bg-orange-100 text-orange-700',
  manager: 'bg-teal-100 text-teal-700',
  admin: 'bg-red-100 text-red-700',
};

export const ROLE_ORDER: UserRole[] = ['admin', 'manager', 'hod', 'hos', 'technician', 'user'];

export const ROLES_REQUIRING_SECTION: UserRole[] = ['technician', 'hos'];
export const ROLES_REQUIRING_CAMPUS_DEPT: UserRole[] = ['hod'];
export const ROLES_REQUIRING_DEPARTMENT: UserRole[] = ['manager'];

export interface RoleScopeValue {
  role: UserRole;
  campus_id: string;
  department_id: string;
  section_id: string;
}
