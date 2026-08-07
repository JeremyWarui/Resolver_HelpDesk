import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, breadcrumbs, action, className }: PageHeaderProps) {
  return (
    <div className={cn('space-y-1', className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground">
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;
            return (
              <span key={index} className="flex items-center gap-1">
                {index > 0 && <span className="select-none">/</span>}
                {isLast || !crumb.href ? (
                  <span className={cn(isLast && 'text-foreground font-medium')}>{crumb.label}</span>
                ) : (
                  <Link
                    to={crumb.href}
                    className="hover:text-foreground transition-colors"
                  >
                    {crumb.label}
                  </Link>
                )}
              </span>
            );
          })}
        </nav>
      )}

      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold leading-tight">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}
