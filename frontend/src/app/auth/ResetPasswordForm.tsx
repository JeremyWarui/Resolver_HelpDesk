import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { confirmPasswordReset } from '@/lib/api/auth';
import { handleDRFError } from '@/utils/handleDRFError';
import { AuthShell } from './AuthShell';

const schema = z.object({
  password: z.string().min(8, 'Use at least 8 characters'),
  confirm: z.string().min(1, 'Type the password again'),
}).refine((v) => v.password === v.confirm, { message: 'The two passwords differ', path: ['confirm'] });

type DRFBody = { token?: string[]; password?: string[] };

/** Sets a new password from the uid and token in an emailed reset link. */
export function ResetPasswordForm() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  // Kept in state, then taken out of the address bar, so the token is not left
  // in the history of a shared computer.
  const [{ uid, token }] = useState(() => ({ uid: params.get('uid') ?? '', token: params.get('token') ?? '' }));
  const [dead, setDead] = useState(!uid || !token);
  useEffect(() => {
    window.history.replaceState(null, '', '/reset-password');
  }, []);
  const [saving, setSaving] = useState(false);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { password: '', confirm: '' } });

  const submit = async ({ password }: z.infer<typeof schema>) => {
    setSaving(true);
    try {
      toast.success(await confirmPasswordReset({ uid, token, password }));
      navigate('/login', { replace: true });
    } catch (error) {
      const body = (error as { response?: { data?: DRFBody } })?.response?.data;
      if (body?.token) setDead(true);
      else if (body?.password) form.setError('password', { message: body.password.join(' ') });
      else handleDRFError(error, { fallbackMessage: 'The password could not be changed. Try again in a moment.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthShell
      heading="Resolver"
      blurb="A maintenance helpdesk for the Kenya School of Government — every request tracked, assigned and closed on time."
    >
      <Card className="w-full shadow-xl border-0">
        <CardHeader className="space-y-4 pb-6">
          <div className="flex justify-center">
            <div className="w-14 h-14 bg-ksg-brown rounded-xl flex items-center justify-center shadow-lg">
              <KeyRound className="w-7 h-7 text-white" />
            </div>
          </div>
          <div className="text-center">
            <CardTitle className="text-2xl font-bold text-gray-900">{dead ? 'This link no longer works' : 'Choose a new password'}</CardTitle>
            <CardDescription className="text-base text-gray-600 mt-2">
              {dead
                ? 'A reset link works once, for one hour. Ask for a new one and use the latest email.'
                : 'You will sign in with it from now on, and every other device is signed out.'}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {dead ? (
            <Button asChild className="w-full h-11 bg-ksg-brown hover:bg-ksg-brown-deep text-white shadow-lg">
              <Link to="/forgot-password">Send a new link</Link>
            </Button>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(submit)} className="space-y-6">
                {(['password', 'confirm'] as const).map((name) => (
                  <FormField
                    key={name}
                    control={form.control}
                    name={name}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-gray-700">{name === 'password' ? 'New password' : 'Type it again'}</FormLabel>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" aria-hidden="true" />
                          <FormControl>
                            <PasswordInput autoComplete="new-password" className="pl-10 h-11" {...field} disabled={saving} />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
                <Button type="submit" className="w-full h-11 bg-ksg-brown hover:bg-ksg-brown-deep text-white shadow-lg" disabled={saving}>
                  {saving ? 'Saving...' : 'Set new password'}
                </Button>
              </form>
            </Form>
          )}

          <div className="text-center">
            <Link to="/login" className="text-sm font-semibold text-foreground underline-offset-4 hover:underline">
              Back to sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
