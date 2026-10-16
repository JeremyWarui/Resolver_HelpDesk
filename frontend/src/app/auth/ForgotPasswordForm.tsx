import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound, Mail, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { requestPasswordReset } from '@/lib/api/auth';
import { handleDRFError } from '@/utils/handleDRFError';
import { AuthShell } from './AuthShell';

const schema = z.object({
  email: z.string().min(1, { message: 'Email is required' }).email({ message: 'Enter a valid email address' }),
});

/** Asks for a reset link by email. The answer never says whether the address has an account. */
export function ForgotPasswordForm() {
  const [sent, setSent] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const submit = async ({ email }: z.infer<typeof schema>) => {
    setSending(true);
    try {
      setSent(await requestPasswordReset(email.trim()));
    } catch (error) {
      handleDRFError(error, { fallbackMessage: 'The link could not be sent. Try again in a moment.' });
    } finally {
      setSending(false);
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
              {sent ? <MailCheck className="w-7 h-7 text-white" /> : <KeyRound className="w-7 h-7 text-white" />}
            </div>
          </div>
          <div className="text-center">
            <CardTitle className="text-2xl font-bold text-gray-900">{sent ? 'Check your email' : 'Forgot your password?'}</CardTitle>
            <CardDescription className="text-base text-gray-600 mt-2">
              {sent ?? 'Enter the email address you sign in with, and we will send a link to choose a new password.'}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {sent ? (
            <p className="text-sm text-gray-600 text-center">
              The link works for one hour. Nothing arrived? Check your spam folder, or{' '}
              <button type="button" onClick={() => setSent(null)} className="font-semibold text-foreground underline-offset-4 hover:underline">
                try again
              </button>
              .
            </p>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(submit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-gray-700">Email Address</FormLabel>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" aria-hidden="true" />
                        <FormControl>
                          <Input type="email" autoComplete="email" placeholder="you@ksg.ac.ke" className="pl-10 h-11" {...field} disabled={sending} />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full h-11 bg-ksg-brown hover:bg-ksg-brown-deep text-white shadow-lg" disabled={sending}>
                  {sending ? 'Sending...' : 'Send reset link'}
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
