import React, { ReactNode } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { getBadgeStyle } from '@/components/shared/ticket/StatusBadge';

interface MetricCardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
  iconBgColor?: string;
  iconColor?: string;
  badge?: {
    value: string;
    color: 'amber' | 'blue' | 'green' | 'red' | 'purple' | 'gray';
  };
  description?: string;
  className?: string;
  customContent?: ReactNode;
  isLoading?: boolean;
}

/**
 * A reusable component for displaying metric statistics in analytics/reports
 * Shows a title, value, icon, and optional change/status badge
 */
const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  icon,
  iconBgColor = "bg-gray-50",
  badge,
  description,
  className = "",
  customContent,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <Card className={`${className} animate-pulse`}>
        <CardContent className='p-3 flex items-center'>
          <div className='bg-gray-200 p-2.5 rounded-full mr-3 h-11 w-11 shrink-0'></div>
          <div className="w-full min-w-0">
            <div className='h-4 bg-gray-200 rounded w-24 mb-2'></div>
            <div className='h-7 bg-gray-200 rounded w-16 mb-2'></div>
            <div className='h-3 bg-gray-200 rounded w-32'></div>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className={className}>
      <CardContent className='p-3 flex items-center'>
        {icon && (
          <div className={`${iconBgColor} p-2.5 rounded-full mr-3 shrink-0`}>
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <p className='text-sm text-gray-500 truncate'>{title}</p>
          <div className='flex items-center'>
            <h3 className='text-2xl font-bold mr-2'>
              {value}
            </h3>
            {badge && (
              <span className="text-xs px-1.5 py-0.5 rounded whitespace-nowrap" style={getBadgeStyle(badge.color)}>
                {badge.value}
              </span>
            )}
          </div>
          {description && (
            <p className='text-xs text-gray-500 truncate'>{description}</p>
          )}
          {customContent}
        </div>
      </CardContent>
    </Card>
  );
};

export default MetricCard;
