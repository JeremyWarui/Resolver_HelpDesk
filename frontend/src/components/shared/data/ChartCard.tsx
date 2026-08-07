import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ReactNode } from 'react';

interface ChartCardProps {
  title: string;
  description?: string;
  /** Optional element rendered in the top-right of the card header (e.g. a dropdown) */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Override CardContent padding — defaults to "p-5 pt-0" */
  contentClassName?: string;
}

const ChartCard = ({
  title,
  description,
  action,
  children,
  className = '',
  contentClassName = 'px-6 pb-6 pt-0',
}: ChartCardProps) => (
  <Card className={`overflow-hidden ${className}`}>
    <CardHeader className="flex flex-row justify-between items-start pb-4 pt-6 px-6">
      <div>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </div>
      {action}
    </CardHeader>
    <CardContent className={contentClassName}>
      {children}
    </CardContent>
  </Card>
);

export default ChartCard;
