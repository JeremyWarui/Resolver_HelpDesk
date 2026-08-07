import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { Mail, Lock, Shield, Settings, Users, Zap, Paperclip, BarChart2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

interface LoginFormProps {
  onSuccess?: () => void;
  onSwitchToRegister?: () => void;
}

const loginSchema = z.object({
  username: z.string().min(1, { message: 'Username is required' }),
  password: z.string().min(1, { message: 'Password is required' })
});

export function LoginForm({ onSuccess, onSwitchToRegister }: LoginFormProps) {
  const { login, isLoading } = useAuth();
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
    defaultValues: { username: '', password: '' }
  });

  const handleLogin = async (values: z.infer<typeof loginSchema>) => {
    try {
      const result = await login({
        username: values.username,
        password: values.password,
        remember_me: false
      });

      toast.success('Welcome back!');

      const roleRedirect: Record<string, string> = {
        admin: '/dashboard',
        technician: '/technician',
        user: '/user',
        hos: '/section-head',
        hod: '/hod',
        manager: '/manager',
      };

      let redirectPath = (result.role && roleRedirect[result.role]) ?? '/user';
      if (result.role === 'technician' && window.innerWidth < 640) {
        redirectPath = '/tech/mobile';
      }
      window.location.assign(redirectPath);

      onSuccess?.();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err?.response?.data?.message || 'Login failed. Please check your credentials.');
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Column - Info */}
      <div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 relative overflow-hidden">
        <div className="absolute inset-0 bg-blue-600 opacity-90" />
        <div className="relative z-10 flex flex-col justify-center px-12 py-12">
          <div className="max-w-md">
            <h2 className="text-3xl font-bold text-white mb-6">
              Resolver
            </h2>
            <p className="text-blue-100 text-lg leading-relaxed mb-8">
              A modern service desk platform for submitting and resolving requests — designed to keep every request tracked, assigned and closed on time.
            </p>

            <div className="space-y-5">
              {[
                { icon: Shield,     title: 'Role-Based Access',   desc: 'Purpose-built views for requesters, technicians, supervisors and management' },
                { icon: Settings,   title: 'Request Tracking',    desc: 'Every request is logged, assigned and followed through to resolution' },
                { icon: Zap,        title: 'SLA & Escalation',    desc: 'Automatic SLA timers and escalation paths keep resolution times in check' },
                { icon: Users,      title: 'Multi-Org Routing',   desc: 'Scales across multiple sites — requests route to the right team automatically' },
                { icon: Paperclip,  title: 'File Attachments',    desc: 'Attach screenshots or documents to any request — images compressed on upload' },
                { icon: BarChart2,  title: 'Analytics & Reports', desc: 'Role-scoped dashboards, metrics and exportable reports for full visibility' },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-center gap-4">
                  <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-sm leading-snug">{title}</h3>
                    <p className="text-blue-100 text-xs leading-relaxed mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-white to-transparent opacity-5 rounded-full transform translate-x-32 -translate-y-32" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-white to-transparent opacity-5 rounded-full transform -translate-x-24 translate-y-24" />
      </div>

      {/* Right Column - Form */}
      <div className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-lg p-8">
          <Card className="w-full shadow-xl border-0">
            <CardHeader className="space-y-4 pb-8">
              <div className="flex justify-center">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-lg">
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
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-gray-700">
                          Username
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <Input
                              placeholder="Enter your username"
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
                    className="w-full h-11 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Signing in...' : 'Sign In'}
                  </Button>
                </form>
              </Form>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => toast.info('Contact your administrator to reset your password.')}
                  className="text-sm font-medium text-blue-600 hover:text-blue-500 transition-colors"
                >
                  Forgot your password?
                </button>
              </div>

              {onSwitchToRegister && (
                <div className="pt-4">
                  <Separator className="mb-6" />
                  <div className="text-center pb-4">
                    <span className="text-sm text-gray-600">Don't have an account? </span>
                    <button
                      type="button"
                      onClick={onSwitchToRegister}
                      className="text-sm font-medium text-blue-600 hover:text-blue-500 transition-colors"
                    >
                      Create account
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
