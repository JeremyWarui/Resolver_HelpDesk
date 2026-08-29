import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { ROLE_LABELS } from '@/constants/roles';

/** The signed-in account, read-only. Two campuses: where they are based, and
 *  what their role covers. */
export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  if (!user) return null;

  const fullName = `${user.first_name} ${user.last_name}`.trim() || user.username;

  const rows: { label: string; value: string }[] = [
    { label: 'First Name', value: user.first_name || '—' },
    { label: 'Last Name', value: user.last_name || '—' },
    { label: 'Username', value: user.username },
    { label: 'Email', value: user.email },
    { label: 'Role', value: ROLE_LABELS[user.role] },
  ];
  if (user.home_campus_name) {
    rows.push({ label: 'Campus', value: user.home_campus_name });
  }
  if (user.primary_campus_name) {
    rows.push({ label: 'Covers', value: user.primary_campus_name });
  }

  return (
    <div className="flex flex-col h-full bg-muted/30">
      <div className="px-6 py-4 border-b bg-background shrink-0 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold">My Profile</h1>
          <p className="text-sm text-muted-foreground">Your account details.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <Card className="max-w-lg overflow-hidden">
          <CardHeader className="border-b bg-muted/30 py-4">
            <CardTitle className="text-base">{fullName}</CardTitle>
            <p className="text-sm text-muted-foreground">@{user.username}</p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.label} className="hover:bg-transparent">
                    <TableCell className="w-40 whitespace-normal py-3 text-xs font-medium text-muted-foreground">
                      {row.label}
                    </TableCell>
                    <TableCell className="whitespace-normal py-3 text-sm font-medium text-foreground">
                      {row.value}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
