import React, { useState } from 'react';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';

interface AuthWrapperProps {
  onSuccess?: () => void;
  defaultView?: 'login' | 'register';
}

export const AuthWrapper: React.FC<AuthWrapperProps> = ({ onSuccess, defaultView = 'login' }) => {
  const [currentView, setCurrentView] = useState<'login' | 'register'>(defaultView);

  return (
    <>
      {currentView === 'login' ? (
        <LoginForm
          onSuccess={onSuccess}
          onSwitchToRegister={() => setCurrentView('register')}
        />
      ) : (
        <RegisterForm
          onSuccess={onSuccess}
          onSwitchToLogin={() => setCurrentView('login')}
        />
      )}
    </>
  );
};