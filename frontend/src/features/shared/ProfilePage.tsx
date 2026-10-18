import { Info } from 'lucide-react';
import { initials } from '@/utils/identity';
import { useAuthStore } from '@/stores/authStore';
import { Card } from '@/components/ui/card';
import { RoleLayout } from '@/components/layout/RoleLayout';
import { ROLE_BADGE_STYLES, ROLE_LABELS } from '@/constants/roles';
import { cn } from '@/lib/utils';

/** The signed-in account, read-only, inside the same shell as every other page.
 *  Two campuses: where they are based, and what their role covers. */
export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;

  const fullName = user.full_name;
  const letters = initials(fullName);

  const details: { label: string; value: string }[] = [
    { label: 'First name', value: user.first_name || '—' },
    { label: 'Last name', value: user.last_name || '—' },
    { label: 'Email', value: user.email },
    { label: 'Username', value: user.username },
    { label: 'Role', value: ROLE_LABELS[user.role] },
    { label: 'Based at', value: user.home_campus_name ?? '—' },
  ];
  if (user.primary_campus_name) {
    details.push({ label: 'Role covers', value: user.primary_campus_name });
  }

  return (
    <RoleLayout title="My Profile" currentUser={user}>
      <div className="p-4 sm:p-6 bg-gray-50 min-h-full">
        <div className="max-w-3xl space-y-4">
          <Card className="p-5 sm:p-6 flex items-center gap-4 sm:gap-5">
            <div
              aria-hidden
              className="h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-lg sm:text-xl font-semibold text-gray-700 uppercase"
            >
              {letters}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 truncate">{fullName}</h2>
              <p className="text-sm text-gray-500 truncate">{user.email}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', ROLE_BADGE_STYLES[user.role])}>
                  {ROLE_LABELS[user.role]}
                </span>
                {user.home_campus_name && (
                  <span className="text-xs text-gray-500">{user.home_campus_name} campus</span>
                )}
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="px-5 sm:px-6 pt-5 pb-3">
              <p className="text-sm font-semibold text-gray-700">Account details</p>
            </div>
            <dl className="grid sm:grid-cols-2 border-t border-gray-100">
              {details.map(({ label, value }) => (
                <div key={label} className="px-5 sm:px-6 py-3.5 border-b border-gray-100 sm:odd:border-r">
                  <dt className="text-xs text-gray-500">{label}</dt>
                  <dd className="mt-0.5 text-sm font-medium text-gray-900 break-words">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="flex items-start gap-2 px-5 sm:px-6 py-4 text-xs text-gray-500">
              <Info className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
              Your name and username come from your email address. To change any of them, or your
              role or campus, ask an administrator.
            </p>
          </Card>
        </div>
      </div>
    </RoleLayout>
  );
}
