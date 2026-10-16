import type { ReactNode } from 'react';
import { BarChart2, MapPin, Paperclip, Settings, Shield, Zap } from 'lucide-react';

/**
 * The two-column frame both auth pages sit in: what Resolver is on the left,
 * the form on the right. Both pages share it, so the six features are said
 * once. The panel is the sidebar's KSG brown, darkest at the top, with a lime
 * and white wave along its foot. White text holds at least 5.70:1 on it.
 */

/** What the product does, said once.
 *
 *  Every line here is a claim shown to someone who has not signed in yet, so
 *  it is checked against what the system actually does rather than what it was
 *  once planned to do. */
const FEATURES = [
  {
    icon: Shield,
    title: 'Role-Based Access',
    desc: 'Purpose-built views for requesters, technicians, supervisors and management',
  },
  {
    icon: Settings,
    title: 'Request Tracking',
    desc: 'Every request is logged, assigned and followed through to resolution',
  },
  {
    icon: Zap,
    title: 'SLA & Escalation',
    desc: 'Automatic SLA timers, and escalation to the section and department heads',
  },
  {
    // Not "multi-org": one department, one Maintenance section, five campuses.
    // It is campus-based and not designed for other departments.
    icon: MapPin,
    title: 'Campus Routing',
    desc: 'Requests route to the maintenance team at the campus they were raised from',
  },
  {
    icon: Paperclip,
    title: 'File Attachments',
    desc: 'Attach photos, PDFs or documents to any request — images compressed on upload',
  },
  {
    icon: BarChart2,
    title: 'Analytics & Reports',
    desc: 'Role-scoped dashboards and reports, downloadable as Excel and PDF',
  },
];

interface AuthShellProps {
  heading: string;
  blurb: string;
  /** The form card. */
  children: ReactNode;
}

export function AuthShell({ heading, blurb, children }: AuthShellProps) {
  return (
    <div className="min-h-screen flex">
      {/* What this is — hidden on narrow screens, where the form is the page. */}
      <div className="hidden lg:flex lg:flex-1 bg-gradient-to-b from-ksg-brown-deep to-ksg-brown-night relative overflow-hidden">
        <div className="relative z-10 flex flex-col justify-center px-12 py-12">
          <div className="max-w-md">
            <h2 className="text-3xl font-bold text-white">{heading}</h2>
            <div className="w-10 h-[3px] rounded-full bg-ksg-green mt-3 mb-6" />
            <p className="text-white/80 text-lg leading-relaxed mb-8">{blurb}</p>

            <div className="space-y-5">
              {FEATURES.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-center gap-4">
                  <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-ksg-green" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-sm leading-snug">{title}</h3>
                    <p className="text-white/80 text-xs leading-relaxed mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <svg
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[22%] w-full"
          viewBox="0 0 800 200"
          preserveAspectRatio="none"
        >
          <path d="M0 135 C 240 60, 500 205, 800 105 L800 200 L0 200 Z" fill="var(--ksg-green)" />
          <path d="M0 165 C 270 110, 530 215, 800 150 L800 200 L0 200 Z" fill="#FFFFFF" />
        </svg>
      </div>

      <div className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-lg">{children}</div>
      </div>
    </div>
  );
}
