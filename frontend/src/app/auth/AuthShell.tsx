import type { ReactNode } from 'react';
import { BarChart2, MapPin, Paperclip, Settings, Shield, Zap } from 'lucide-react';

/**
 * The two-column frame both auth pages sit in: what Resolver is on the left,
 * the form on the right.
 *
 * Login and register each carried their own copy of this, and it had already
 * drifted — different wording for the same six features, one of them listing
 * an attachment feature the other omitted. The accent colour is the one thing
 * that is genuinely meant to differ between the two.
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
    // REVIEW.md §1 is explicit that this is campus-based and is not to be
    // designed for other departments.
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
    // No "exportable": the Excel export was removed, and /analytics/ is the one
    // reporting route. A login page must not advertise what was deleted.
    icon: BarChart2,
    title: 'Analytics & Reports',
    desc: 'Role-scoped dashboards and metrics, from ticket volume to technician performance',
  },
];

const ACCENT = {
  blue: {
    panel: 'from-blue-600 via-blue-700 to-indigo-800',
    wash: 'bg-blue-600',
    body: 'text-blue-100',
  },
  green: {
    panel: 'from-green-600 via-green-700 to-emerald-800',
    wash: 'bg-green-600',
    body: 'text-green-100',
  },
};

interface AuthShellProps {
  accent: keyof typeof ACCENT;
  heading: string;
  blurb: string;
  /** The form card. */
  children: ReactNode;
}

export function AuthShell({ accent, heading, blurb, children }: AuthShellProps) {
  const tone = ACCENT[accent];

  return (
    <div className="min-h-screen flex">
      {/* What this is — hidden on narrow screens, where the form is the page. */}
      <div className={`hidden lg:flex lg:flex-1 bg-gradient-to-br ${tone.panel} relative overflow-hidden`}>
        <div className={`absolute inset-0 ${tone.wash} opacity-90`} />
        <div className="relative z-10 flex flex-col justify-center px-12 py-12">
          <div className="max-w-md">
            <h2 className="text-3xl font-bold text-white mb-6">{heading}</h2>
            <p className={`${tone.body} text-lg leading-relaxed mb-8`}>{blurb}</p>

            <div className="space-y-5">
              {FEATURES.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-center gap-4">
                  <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-sm leading-snug">{title}</h3>
                    <p className={`${tone.body} text-xs leading-relaxed mt-0.5`}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-white to-transparent opacity-5 rounded-full transform translate-x-32 -translate-y-32" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-white to-transparent opacity-5 rounded-full transform -translate-x-24 translate-y-24" />
      </div>

      <div className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-lg">{children}</div>
      </div>
    </div>
  );
}
