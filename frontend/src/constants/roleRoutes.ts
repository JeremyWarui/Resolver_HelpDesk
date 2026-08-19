import type { UserRole } from '@/types';

/**
 * Where each role lives. The sidebar builds its links from this and the login
 * redirect reads it, which is the point: the two were separate maps under two
 * names, so renaming a prefix landed a signed-in user on a 404 while the
 * sidebar kept working.
 *
 * App.tsx still spells its route paths out literally — a route file that reads
 * as its own URLs is worth more there than the deduplication.
 */
export const ROLE_BASE: Record<UserRole, string> = {
  user: '/user',
  technician: '/technician',
  hos: '/section-head',
  hod: '/hod',
  manager: '/manager',
  admin: '/dashboard',
};
