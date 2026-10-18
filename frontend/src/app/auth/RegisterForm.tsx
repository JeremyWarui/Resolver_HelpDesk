import React from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { User, Mail, Lock, UserPlus, MapPin, CheckCircle } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { getPublicCampuses, clearSession, type PublicCampus } from '@/lib/api/auth';
import { deriveIdentity } from '@/utils/identity';
import { AuthShell } from './AuthShell';

const registerSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
  campus_id: z.string().min(1, 'Select your campus')
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const RegisterForm: React.FC = () => {
  const navigate = useNavigate();
  const { register, isLoading } = useAuth();
  const [campuses, setCampuses] = React.useState<PublicCampus[]>([]);
  const [registeredEmail, setRegisteredEmail] = React.useState<string | null>(null);

  React.useEffect(() => {
    getPublicCampuses().then(setCampuses).catch(() => {});
  }, []);

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      campus_id: ''
    }
  });

  const emailValue = form.watch('email');
  const preview = deriveIdentity(emailValue);

  const handleSubmit = async (values: z.infer<typeof registerSchema>) => {
    try {
      await register({
        email: values.email.trim(),
        password: values.password,
        campus_id: Number(values.campus_id)
      });

      // Registration auto-logs the user in; we want them to land on /login and
      // sign in with the email they just gave, so drop that session.
      clearSession();
      setRegisteredEmail(values.email.trim());
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string; error?: string; errors?: Record<string, string> } } };
      const errorMessage = err?.response?.data?.message
        || err?.response?.data?.error
        || 'Registration failed. Please try again.';

      if (err?.response?.data?.errors) {
        Object.keys(err.response.data.errors).forEach(field => {
          form.setError(field as keyof z.infer<typeof registerSchema>, {
            type: 'server',
            message: err.response!.data!.errors![field]
          });
        });
      }

      toast.error(errorMessage);
    }
  };

  return (
    <>
      <AuthShell
        icon={UserPlus}
        title="Create Account"
        description="Get started with Resolver"
        heading="Join Resolver"
        blurb="Create your account and raise your first request in minutes. Resolver follows every request from submission to resolution."
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-gray-700">Email Address</FormLabel>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" aria-hidden="true" />
                    <FormControl>
                      <Input type="email" autoComplete="email" placeholder="you@ksg.ac.ke" className="pl-10 h-11" {...field} disabled={isLoading} />
                    </FormControl>
                  </div>
                  {preview ? (
                    <p className="flex items-center gap-1.5 text-xs text-gray-600">
                      <User className="w-3.5 h-3.5 text-gray-400" />
                      You'll appear as <span className="font-medium text-gray-800">{preview.name}</span>
                      <span className="text-gray-400">·</span>
                      <span className="font-mono">{preview.username}</span>
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500">
                      Use your work address — your name is taken from it, e.g. jeremy.mwangi@ksg.ac.ke becomes Jeremy Mwangi.
                    </p>
                  )}
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="campus_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-gray-700">Campus</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={isLoading}>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 z-10 pointer-events-none" aria-hidden="true" />
                      <FormControl>
                        <SelectTrigger className="pl-10 h-11">
                          <SelectValue placeholder="Select your campus" />
                        </SelectTrigger>
                      </FormControl>
                    </div>
                    <SelectContent>
                      {campuses.map(c => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-gray-700">Password</FormLabel>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" aria-hidden="true" />
                      <FormControl>
                        <PasswordInput placeholder="Create password" className="pl-10 h-11" {...field} disabled={isLoading} />
                      </FormControl>
                    </div>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-gray-700">Confirm Password</FormLabel>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" aria-hidden="true" />
                      <FormControl>
                        <PasswordInput placeholder="Confirm password" className="pl-10 h-11" {...field} disabled={isLoading} />
                      </FormControl>
                    </div>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 bg-ksg-brown hover:bg-ksg-brown-deep text-white shadow-lg"
              disabled={isLoading}
            >
              {isLoading ? 'Creating Account...' : 'Create Account'}
            </Button>
          </form>
        </Form>

        <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-100">
          <h4 className="font-semibold text-green-800 mb-2 flex items-center">
            <CheckCircle className="w-4 h-4 mr-2" />
            Account Information
          </h4>
          <ul className="text-sm text-green-700 space-y-1">
            <li>• You sign in with your email address — there's no separate username to remember</li>
            <li>• Your name comes from the part before the @ (jeremy.mwangi → Jeremy Mwangi)</li>
            <li>• New accounts start with the requester role by default</li>
            <li>• Contact your administrator to be assigned a staff role</li>
            <li>• Requests are routed automatically based on your organisation's structure</li>
          </ul>
        </div>

        <div className="pt-6">
          <Separator className="mb-6" />
          <div className="text-center pb-4">
            <span className="text-sm text-gray-600">Already have an account? </span>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="text-sm font-semibold text-foreground underline-offset-4 hover:underline"
            >
              Sign in instead
            </button>
          </div>
        </div>
      </AuthShell>

    <Dialog open={registeredEmail !== null} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-6 w-6 text-green-600" />
          </div>
          <DialogTitle className="text-center">Account Created</DialogTitle>
          <DialogDescription className="text-center">
            Your account is ready. Sign in with the email address below and the password you just set.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border bg-muted/40 py-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Sign in with</p>
          <p className="text-lg font-semibold tracking-wide">{registeredEmail}</p>
        </div>
        <DialogFooter>
          <Button
            className="w-full bg-ksg-brown hover:bg-ksg-brown-deep text-white"
            onClick={() => {
              setRegisteredEmail(null);
              navigate('/login');
            }}
          >
            Continue to Login
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
};
