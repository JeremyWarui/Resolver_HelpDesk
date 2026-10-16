import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { toast } from 'sonner';
import { Mail, Lock, Shield } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { ROLE_BASE } from '@/constants/roles';
import { AuthShell } from './AuthShell';

const loginSchema = z.object({
  email: z.string().min(1, { message: 'Email is required' })
    .email({ message: 'Enter a valid email address' }),
  password: z.string().min(1, { message: 'Password is required' })
});

export function LoginForm() {
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Set by apiClient's refresh interceptor when a silent token refresh finds
  // the user's role changed server-side (promoted/demoted) — their cached
  // session was already cleared, this just explains why they landed here.
  useEffect(() => {
    if (searchParams.get('reason') === 'role-changed') {
      // Sonner's <Toaster> subscribes to the toast store in its own effect —
      // calling toast() in the same tick as this component's mount can fire
      // before that subscription exists. Defer one tick so it's never missed.
      setTimeout(() => {
        toast.info('Your role was updated — please log in again to continue.');
      }, 0);
      setSearchParams((prev) => {
        prev.delete('reason');
        return prev;
      }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' }
  });

  const handleLogin = async (values: z.infer<typeof loginSchema>) => {
    try {
      const result = await login({
        email: values.email.trim(),
        password: values.password,
        remember_me: false
      });

      toast.success('Welcome back!');

      const redirectPath = (result.role && ROLE_BASE[result.role as keyof typeof ROLE_BASE]) ?? '/user';
      // A full load, not a client navigation: the dashboard reads the session
      // the store hydrates at module load, and the axios interceptor picks up
      // the new token on the way.
      window.location.assign(redirectPath);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err?.response?.data?.message || 'Login failed. Please check your credentials.');
    }
  };

  return (
    <AuthShell
      heading="Resolver"
      blurb="A maintenance helpdesk for the Kenya School of Government — every request tracked, assigned and closed on time."
    >
      <Card className="w-full shadow-xl border-0">
        <CardHeader className="space-y-4 pb-8">
          <div className="flex justify-center">
            <div className="w-14 h-14 bg-ksg-brown rounded-xl flex items-center justify-center shadow-lg">
              <Shield className="w-7 h-7 text-white" />
            </div>
          </div>
          <div className="text-center">
            <CardTitle className="text-2xl font-bold text-gray-900">
              Welcome Back
            </CardTitle>
            <CardDescription className="text-base text-gray-600 mt-2">
              Sign in to Resolver
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <Form {...loginForm}>
            <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-6">
              <FormField
                control={loginForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-gray-700">
                      Email Address
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <Input
                          type="email"
                          autoComplete="email"
                          placeholder="you@ksg.ac.ke"
                          className="pl-10 h-11"
                          {...field}
                          disabled={isLoading}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={loginForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-gray-700">
                      Password
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <PasswordInput
                          placeholder="Enter your password"
                          className="pl-10 h-11"
                          {...field}
                          disabled={isLoading}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full h-11 bg-ksg-brown hover:bg-ksg-brown-deep text-white shadow-lg"
                disabled={isLoading}
              >
                {isLoading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          </Form>

          <div className="text-center">
            <Link to="/forgot-password" className="text-sm font-semibold text-foreground underline-offset-4 hover:underline">
              Forgot your password?
            </Link>
          </div>

          <div className="pt-4">
              <Separator className="mb-6" />
              <div className="text-center pb-4">
                <span className="text-sm text-gray-600">Don't have an account? </span>
                <button
                  type="button"
                  onClick={() => navigate('/register')}
                  className="text-sm font-semibold text-foreground underline-offset-4 hover:underline"
                >
                  Create account
                </button>
              </div>
            </div>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
