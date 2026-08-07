/*
 * DISABLED FOR TESTING - Magic Link functionality temporarily commented out
 * This component handles magic link authentication but is currently disabled
 * for testing purposes to avoid email delivery issues.
 * 
 * To re-enable: Uncomment this component and restore magic link methods in
 * - authService.ts
 * - useAuth.ts
 * - LoginForm.tsx
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Loader2, Mail } from 'lucide-react';

export const MagicLinkHandler: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>(() => token ? 'verifying' : 'error');
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    if (!token) return;

    const handleMagicLink = async () => {
      try {
        // COMMENTED OUT FOR TESTING - Magic Link functionality disabled
        // const result = await magicLinkLogin(token, rememberMe);
        // setStatus('success');
        // toast.success(`Welcome, ${result.first_name}!`);
        
        // Temporary placeholder for testing
        setStatus('error');
        toast.error('Magic link authentication is temporarily disabled for testing');
        return;
        
        // COMMENTED OUT FOR TESTING
        // Redirect after 2 seconds
        // setTimeout(() => {
        //   // Redirect based on role
        //   switch (result.role) {
        //     case 'admin':
        //     case 'manager':
        //       navigate('/dashboard');
        //       break;
        //     case 'technician':
        //       navigate('/technician');
        //       break;
        //     case 'user':
        //       navigate('/user');
        //       break;
        //     default:
        //       navigate('/');
        //   }
        // }, 2000);
      } catch (error: unknown) {
        setStatus('error');
        const err = error as { response?: { data?: { message?: string } } };
        toast.error(err?.response?.data?.message || 'Invalid or expired link');
      }
    };

    // Add a small delay to show the verification state
    setTimeout(handleMagicLink, 1000);
  }, [token, rememberMe, navigate]); // Removed magicLinkLogin from dependencies

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md shadow-lg border-0">
        <CardHeader className="space-y-1 pb-8">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
              <Mail className="w-6 h-6 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-center text-gray-800">
            Magic Link Authentication
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 text-center">
          {status === 'verifying' && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">
                  Verifying your login link...
                </h3>
                <p className="text-gray-600">
                  Please wait while we authenticate your access.
                </p>
              </div>
              
              {/* Remember me option during verification */}
              <div className="flex items-center justify-center space-x-2 p-4 bg-gray-50 rounded-lg">
                <input
                  type="checkbox"
                  id="rememberMagic"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
                <label htmlFor="rememberMagic" className="text-sm text-gray-700 font-medium">
                  Stay signed in for 30 days
                </label>
              </div>
            </div>
          )}
          
          {status === 'success' && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold text-green-700 mb-2">
                  Login Successful!
                </h3>
                <p className="text-gray-600">
                  Redirecting to your dashboard...
                </p>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-green-600 h-2 rounded-full animate-pulse" style={{ width: '100%' }}></div>
              </div>
            </div>
          )}
          
          {status === 'error' && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                  <XCircle className="w-8 h-8 text-red-600" />
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold text-red-700 mb-2">
                  Authentication Failed
                </h3>
                <p className="text-gray-600 mb-4">
                  This magic link is invalid or has expired. Please request a new one.
                </p>
              </div>
              <Button 
                onClick={() => navigate('/login')} 
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Back to Login
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};