import type { ReactNode } from 'react';
import { Clock, Hourglass, Mail, MessageSquare, UserCog, Users, Wrench } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import MetricCard from '@/components/shared/data/MetricCard';
import { useDesk } from '@/hooks/useAnalytics';
import type { DeskEnvelope } from '@/types';
import { timeAgo } from '@/utils/date';
import { FEEDBACK_CATEGORIES } from '@/constants/systemFeedback';
import { ESCALATION_SCHEDULE } from '@/constants/roles';
import { cn } from '@/lib/utils';

const CATEGORY = Object.fromEntries(FEEDBACK_CATEGORIES.map((c) => [c.key, c]));

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The admin's dashboard: what needs setting up, and whether the work is
 * moving. Every card opens the page that fixes it; the figures are the
 * manager's to read. All of it comes from `/analytics/desk/`.
 */
export default function AdminDashboard({ onNavigate }: { onNavigate: (section: string) => void }) {
  const { desk, loading, error } = useDesk();

  return (
    <div className="flex-1 overflow-y-auto bg-muted/30 p-3 sm:p-4 space-y-4">
      <p className="text-sm text-muted-foreground">
        What needs setting up, and whether the work is moving. Each card opens the page that fixes it.
      </p>
      {error ? (
        <Card className="p-6 text-center text-sm text-destructive">The dashboard could not be loaded.</Card>
      ) : (
        <>
          <h2 className="text-sm font-semibold text-gray-700">Is it set up?</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {setupCards(desk).map((c) => <LinkCard key={c.title} {...c} loading={loading} onNavigate={onNavigate} />)}
          </div>
          <h2 className="text-sm font-semibold text-gray-700">Is the work moving?</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {movingCards(desk).map((c) => <LinkCard key={c.title} {...c} loading={loading} onNavigate={onNavigate} />)}
          </div>
          <CoverByCampus desk={desk} onNavigate={onNavigate} />
          <UnreadFeedback desk={desk} onNavigate={onNavigate} />
        </>
      )}
    </div>
  );
}

interface CardSpec {
  title: string;
  value: ReactNode;
  description: string;
  icon: ReactNode;
  iconBgColor: string;
  alert: boolean;
  /** The nav section that fixes it; none for a card with nowhere to go yet. */
  section?: string;
}

function setupCards(desk: DeskEnvelope | null): CardSpec[] {
  const e = desk?.escalation;
  const look = ESCALATION_SCHEDULE[e?.state ?? 'never'];
  const due = e ? (e.due_hos || e.due_hod ? `${e.due_hos} due to the HOS · ${e.due_hod} to the HOD` : 'Nothing due to climb') : '';
  const fix = desk?.accounts_to_fix;
  return [
    {
      title: 'Escalation check',
      value: look.label,
      description: e?.last_finished_at ? `Last run ${timeAgo(e.last_finished_at)} · ${due}` : `Never run · ${due}`,
      icon: <Clock className={look.alert ? 'h-5 w-5 text-red-700' : 'h-5 w-5 text-emerald-700'} />,
      iconBgColor: look.alert ? 'bg-red-100' : 'bg-emerald-100',
      alert: look.alert, section: 'sla-rules',
    },
    {
      title: 'Trades with nobody to send',
      value: desk?.cover.gaps ?? 0,
      description: desk?.cover.gaps
        ? `Across ${plural(desk.cover.gap_campuses, 'campus', 'campuses')} · ${plural(desk.cover.stuck, 'open job')} waiting`
        : 'Every trade covered at every campus',
      icon: <Wrench className={desk?.cover.gaps ? 'h-5 w-5 text-red-700' : 'h-5 w-5 text-emerald-700'} />,
      iconBgColor: desk?.cover.gaps ? 'bg-red-100' : 'bg-emerald-100',
      alert: Boolean(desk?.cover.gaps), section: 'technicians',
    },
    {
      title: 'Accounts to fix',
      value: fix?.count ?? 0,
      description: fix?.count
        ? [
            fix.by_problem.no_home_campus && `${fix.by_problem.no_home_campus} with no home campus`,
            fix.by_problem.technician_without_trade && `${plural(fix.by_problem.technician_without_trade, 'technician')} with no trade`,
          ].filter(Boolean).join(' · ')
        : 'Every account can work',
      icon: <UserCog className="h-5 w-5 text-amber-700" />, iconBgColor: fix?.count ? 'bg-amber-100' : 'bg-emerald-100',
      alert: Boolean(fix?.count), section: 'users',
    },
    {
      title: 'Email',
      value: desk?.email_configured ? 'Set up' : 'Not set up',
      description: 'For password resets and resolved-ticket emails',
      icon: <Mail className="h-5 w-5 text-gray-600" />, iconBgColor: 'bg-gray-100',
      alert: false,
    },
  ];
}

function movingCards(desk: DeskEnvelope | null): CardSpec[] {
  const t = desk?.technicians;
  const f = desk?.feedback;
  const quiet = t?.quiet ?? [];
  return [
    {
      title: 'Waiting over 24 hours',
      value: desk?.waiting_too_long ?? 0,
      description: 'Open with nobody sent since yesterday or before',
      icon: <Hourglass className="h-5 w-5 text-amber-700" />, iconBgColor: 'bg-amber-100',
      alert: Boolean(desk?.waiting_too_long), section: 'tickets',
    },
    {
      title: 'Technicians active this week',
      value: t ? `${t.active} / ${t.total}` : '—',
      description: quiet.length === 0 ? 'Every technician touched a ticket this week'
        : quiet.length === 1 ? `${quiet[0].name} (${quiet[0].where}) has not touched a ticket in 7 days`
          : `${quiet.length} have not touched a ticket in 7 days`,
      icon: <Users className="h-5 w-5 text-blue-600" />, iconBgColor: 'bg-blue-100',
      alert: false, section: 'technicians',
    },
    {
      title: 'Unread system feedback',
      value: f?.unread ?? 0,
      description: f ? FEEDBACK_CATEGORIES.map((c) => c.key)
        .filter((k) => f.by_category[k])
        .map((k) => plural(f.by_category[k], CATEGORY[k].label.toLowerCase()))
        .join(' · ') || 'Nothing new' : '',
      icon: <MessageSquare className="h-5 w-5 text-blue-600" />, iconBgColor: 'bg-blue-100',
      alert: false, section: 'system-feedback',
    },
  ];
}

function LinkCard({ section, onNavigate, loading, alert, ...card }: CardSpec & {
  loading: boolean;
  onNavigate: (section: string) => void;
}) {
  const body = <MetricCard {...card} isLoading={loading} tone={alert ? 'alert' : 'default'} className="h-full" wrapDescription />;
  if (!section) return body;
  return (
    <button type="button" className="h-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${card.title}: open the page that fixes it`} onClick={() => onNavigate(section)}>
      {body}
    </button>
  );
}

function CoverByCampus({ desk, onNavigate }: { desk: DeskEnvelope | null; onNavigate: (section: string) => void }) {
  return (
    <Card aria-label="Cover by campus">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Cover by campus</CardTitle>
          <CardDescription>Who holds each post, and the trades a requester can pick with nobody to send.</CardDescription>
        </div>
        <button type="button" className="text-sm text-primary hover:underline" onClick={() => onNavigate('technicians')}>
          Cover by trade
        </button>
      </CardHeader>
      <CardContent>
        {desk == null ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="p-2 font-medium">Campus</th>
                  <th className="p-2 font-medium">Head of Department</th>
                  <th className="p-2 font-medium">Head of Section</th>
                  <th className="p-2 text-right font-medium">Technicians</th>
                  <th className="p-2 text-right font-medium">Facilities</th>
                  <th className="p-2 font-medium">No technician for</th>
                  <th className="p-2 text-right font-medium">Open jobs stuck</th>
                </tr>
              </thead>
              <tbody>
                {desk.campuses.map((c) => (
                  <tr key={c.id} className="border-t">
                    <th scope="row" className="p-2 text-left font-medium">{c.name}</th>
                    <td className={cn('p-2', !c.hod && 'font-medium text-red-700')}>{c.hod ?? 'Vacant'}</td>
                    <td className={cn('p-2', !c.hos && 'font-medium text-red-700')}>{c.hos ?? 'Vacant'}</td>
                    <td className="p-2 text-right tabular-nums">{c.technicians}</td>
                    <td className="p-2 text-right tabular-nums">{c.facilities}</td>
                    <td className="p-2">
                      {c.gaps.length ? (
                        <span className="flex flex-wrap gap-1.5">
                          {c.gaps.map((g) => (
                            <span key={g} className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">{g}</span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-emerald-700">Every trade covered</span>
                      )}
                    </td>
                    <td className={cn('p-2 text-right tabular-nums', c.stuck ? 'font-semibold text-red-700' : 'text-muted-foreground')}>
                      {c.stuck}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UnreadFeedback({ desk, onNavigate }: { desk: DeskEnvelope | null; onNavigate: (section: string) => void }) {
  const rows = desk?.feedback.latest ?? null;
  return (
    <Card aria-label="System feedback, unread">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-base">System feedback, unread</CardTitle>
        <button type="button" className="text-sm text-primary hover:underline" onClick={() => onNavigate('system-feedback')}>
          All feedback
        </button>
      </CardHeader>
      <CardContent>
        {rows == null ? (
          <Skeleton className="h-28 w-full" />
        ) : rows.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Nothing unread.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <tbody>
                {rows.map((f) => (
                  <tr key={f.id} className="border-t border-gray-100 first:border-t-0">
                    <th scope="row" className={cn('w-28 border-r border-gray-100 px-4 py-2.5 text-left align-top font-semibold', CATEGORY[f.category].tint)}>
                      {CATEGORY[f.category].label}
                    </th>
                    <td className="px-4 py-2.5 text-gray-900">{f.message}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right align-top text-muted-foreground">
                      {f.author_role} · {timeAgo(f.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
