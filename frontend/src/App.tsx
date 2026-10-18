import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Suspense, lazy, type ReactNode } from "react";
import { Toaster } from "./components/ui/sonner";
import { HomeRedirect, ProtectedRoute } from "./app/auth/ProtectedRoute";
import { LoginForm } from "./app/auth/LoginForm";
import { RegisterForm } from "./app/auth/RegisterForm";
import { ForgotPasswordForm } from "./app/auth/ForgotPasswordForm";
import { ResetPasswordForm } from "./app/auth/ResetPasswordForm";
import { DashboardShell } from "./app/dashboard/DashboardShell";
import { NotFoundPage } from "./app/NotFoundPage";
import { useRegisterSW } from 'virtual:pwa-register/react';
import { ROLE_BASE } from "./constants/roles";
import type { UserRole } from "./types";

// Lazy load main layout components for better code splitting
const AdminLayout = lazy(() => import("./features/admin/AdminLayout"));
const UserLayout = lazy(() => import("./features/user/UserLayout"));
const TechnicianLayout = lazy(() => import("./features/technician/TechnicianLayout"));
const SupervisorLayout = lazy(() => import("./features/shared/SupervisorLayout"));
const ManagerLayout = lazy(() => import("./features/manager/ManagerLayout"));
const ProfilePage = lazy(() => import("./features/shared/ProfilePage").then(m => ({ default: m.ProfilePage })));

/** The layout each role's pages render in, under `ROLE_BASE[role]`. */
const LAYOUT: Record<UserRole, ReactNode> = {
  admin: <AdminLayout />,
  user: <UserLayout />,
  technician: <TechnicianLayout />,
  hos: <SupervisorLayout role="hos" />,
  hod: <SupervisorLayout role="hod" />,
  manager: <ManagerLayout />,
};

const RouteLoading = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    <span className="ml-2 text-muted-foreground">Loading...</span>
  </div>
);

const App = () => {
  // Register/update service worker automatically
  useRegisterSW({ immediate: true });

  return (
    <Router>
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          {/* Public Authentication Routes */}
          <Route path="/login" element={<LoginForm />} />
          <Route path="/register" element={<RegisterForm />} />
          <Route path="/forgot-password" element={<ForgotPasswordForm />} />
          <Route path="/reset-password" element={<ResetPasswordForm />} />

          {/* Protected Dashboard Routes */}
          <Route element={<DashboardShell />}>
            {(Object.keys(ROLE_BASE) as UserRole[]).map((role) => (
              <Route
                key={role}
                path={`${ROLE_BASE[role]}/*`}
                element={
                  // Every role may raise tickets, so the requester's pages admit anyone signed in.
                  <ProtectedRoute requiredRoles={role === 'user' ? [] : [role]}>
                    {LAYOUT[role]}
                  </ProtectedRoute>
                }
              />
            ))}
            <Route
              path="/profile"
              element={
                <ProtectedRoute requiredRoles={[]}>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />
          </Route>

          <Route path="/" element={<HomeRedirect />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      <Toaster richColors position="top-right" />
    </Router>
  );
};

export default App;
