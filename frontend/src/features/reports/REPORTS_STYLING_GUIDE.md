# Reports Pages — Styling & Layout Consistency Guide

All Reports pages (Admin, Manager, HOD, HOS, Technician) follow the same visual language from the AdminDashboard Reports page.

## Layout Template

```tsx
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { [Icon1, Icon2, Icon3] } from 'lucide-react';
import MetricCard from '@/components/shared/data/MetricCard';

export default function ReportsPageEnhanced() {
  const [activeView, setActiveView] = useState<'overview' | 'tab1' | 'tab2'>('overview');
  const { data: analytics } = use[Role]Analytics({ days: 30 });

  return (
    <div className="flex-1 overflow-y-auto bg-muted/30">
      {/* ===== HEADER (sticky) ===== */}
      <div className="bg-card border-b sticky top-0 z-10">
        <div className="px-4 md:px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Navigation Tabs (left) */}
            <div className="flex gap-2 overflow-x-auto">
              <Button
                variant={activeView === 'overview' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveView('overview')}
                className="gap-2"
              >
                <Icon className="h-4 w-4" />
                Overview
              </Button>
              <Button
                variant={activeView === 'tab1' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveView('tab1')}
                className="gap-2"
              >
                <Icon className="h-4 w-4" />
                Tab 1
              </Button>
              {/* ... more tabs */}
            </div>

            {/* Action Buttons (right) */}
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" className="gap-2">
                <RefreshIcon className="h-4 w-4" />
                Refresh
              </Button>
              <Button variant="outline" size="sm" className="gap-2">
                <FilterIcon className="h-4 w-4" />
                Filters
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ===== CONTENT AREA ===== */}
      <div className="p-4 md:p-6 space-y-6">
        {activeView === 'overview' && (
          <>
            {/* Section: Metric Cards */}
            <div>
              <h2 className="text-lg font-semibold mb-4 text-foreground">
                System Overview
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                  title="Metric 1"
                  value={value1}
                  description="Subtitle"
                  icon={<Icon1 className="h-6 w-6 text-primary" />}
                  iconBgColor="bg-primary/10"
                  className="bg-card"
                />
                {/* ... more metric cards (4 total) */}
              </div>
            </div>

            {/* Section: Quick Access Cards */}
            <div>
              <h2 className="text-lg font-semibold mb-4 text-foreground">
                Quick Access Reports
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                  <CardHeader className="pb-4 pt-6">
                    <div className="flex items-start justify-between">
                      <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Icon1 className="h-6 w-6 text-blue-600" />
                      </div>
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        Live Data
                      </Badge>
                    </div>
                    <CardTitle className="mt-6">Card Title</CardTitle>
                    <CardDescription className="mt-2">
                      Card description
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 pb-6">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      onClick={() => setActiveView('tab1')}
                    >
                      View Report →
                    </Button>
                  </CardContent>
                </Card>
                {/* ... 2 more quick access cards (3 total) */}
              </div>
            </div>
          </>
        )}

        {/* Detail Report View */}
        {activeView === 'tab1' && (
          <Card>
            <CardHeader className="pb-6 pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="pb-2 flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    Report Title
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Report description
                  </CardDescription>
                </div>
                <Badge variant="outline" className="bg-blue-50 text-blue-700">
                  Live Data
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <ReportComponent />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
```

## Color Scheme by Role

| Role | Primary | Icon Color | Badge BG | Icon BG | Metric BG |
|------|---------|-----------|----------|---------|-----------|
| Admin | Blue | `text-primary` | `bg-blue-50` text-blue-700 border-blue-200 | `bg-blue-100` | `text-blue-600` |
| Manager | Green | `text-status-resolved` | `bg-green-50` text-green-700 border-green-200 | `bg-green-100` | `text-green-600` |
| HOD | Purple | `text-status-progress` | `bg-purple-50` text-purple-700 border-purple-200 | `bg-purple-100` | `text-purple-600` |
| HOS | Orange | `text-status-assigned` | `bg-orange-50` text-orange-700 border-orange-200 | `bg-orange-100` | `text-orange-600` |
| Technician | Cyan | `text-cyan-600` | `bg-cyan-50` text-cyan-700 border-cyan-200 | `bg-cyan-100` | `text-cyan-600` |

## Metric Card Component

```tsx
<MetricCard
  title="Total Tickets"
  value={1247}
  description="Last 30 days"
  icon={<FileText className="h-6 w-6 text-[color]" />}
  iconBgColor="bg-[color]-100"
  className="bg-card"
  trend={{ value: 15, direction: "up" }}  // optional
/>
```

**Classes used:**
- Title: `font-semibold`
- Value: `font-bold text-2xl`
- Description: `text-muted-foreground text-sm`
- Trend: `text-[color] text-sm`

## Quick Access Card Template

```tsx
<Card className="hover:shadow-lg transition-shadow cursor-pointer">
  <CardHeader className="pb-4 pt-6">
    <div className="flex items-start justify-between">
      {/* Icon with background */}
      <div className="h-12 w-12 bg-[color]-100 rounded-lg flex items-center justify-center">
        <Icon className="h-6 w-6 text-[color]-600" />
      </div>
      {/* Status badge */}
      <Badge 
        variant="outline"
        className="bg-[color]-50 text-[color]-700 border-[color]-200"
      >
        Status
      </Badge>
    </div>
    <CardTitle className="mt-6">Title</CardTitle>
    <CardDescription className="mt-2">Description</CardDescription>
  </CardHeader>
  <CardContent className="pt-0 pb-6">
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start text-[color]-600 hover:text-[color]-700 hover:bg-[color]-50"
    >
      View Report →
    </Button>
  </CardContent>
</Card>
```

## Responsive Grids

### Metric Cards (4 per row on lg)
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
  {/* 4 MetricCard components */}
</div>
```

### Quick Access Cards (3 per row on lg)
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* 3 Card components */}
</div>
```

### Detail Report (full width)
```tsx
<div className="grid grid-cols-1 gap-6">
  <Card>
    {/* ReportComponent 1 */}
  </Card>
  <Card>
    {/* ReportComponent 2 */}
  </Card>
</div>
```

## Special: Technician Reports (Individual vs Sectional)

For Technician Reports, use **visual distinction** between Individual (primary) and Sectional (context):

```tsx
{/* Section 1: My Performance (primary) */}
<div>
  <h2 className="text-lg font-semibold mb-4 text-foreground">
    My Performance
  </h2>
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    {/* 4 individual metric cards (color: cyan) */}
  </div>
</div>

{/* Section 2: My Section — Context (muted) */}
<div>
  <div className="flex items-center gap-3 mb-4">
    <h2 className="text-lg font-semibold text-foreground">
      My Section — Context
    </h2>
    <Badge variant="outline" className="bg-gray-100 text-gray-700 border-gray-300">
      [CONTEXT]
    </Badge>
  </div>
  <p className="text-sm text-muted-foreground mb-4">
    Informational only. You cannot change section-level settings.
  </p>
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {/* 3 sectional metric cards (muted color) */}
  </div>
</div>
```

## Badge Variants

```tsx
// Live Data
<Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
  Live Data
</Badge>

// Real-time
<Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
  Real-time
</Badge>

// Updated
<Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
  Updated
</Badge>

// Context (for informational sections)
<Badge variant="outline" className="bg-gray-100 text-gray-700 border-gray-300">
  [CONTEXT]
</Badge>
```

## Spacing & Padding

- Header: `px-4 md:px-6 py-3`
- Content: `p-4 md:p-6 space-y-6`
- CardHeader: `pb-6 pt-6` (or `pb-4 pt-6` for quick cards)
- CardContent: `px-6 pb-6`
- Grid gaps: `gap-4` (cards), `gap-6` (sections)

## Sticky Header & Scroll

```tsx
<div className="flex-1 overflow-y-auto bg-muted/30">
  {/* Header - sticky */}
  <div className="bg-card border-b sticky top-0 z-10">
    {/* ... */}
  </div>

  {/* Content - scrollable */}
  <div className="p-4 md:p-6 space-y-6">
    {/* ... */}
  </div>
</div>
```

---

## Implementation Checklist

- [ ] Copy layout template from ReportsPageEnhanced.tsx
- [ ] Apply role-specific color scheme (icon, badge, metric BG)
- [ ] Ensure 4 metric cards in overview section
- [ ] Ensure 3 quick access cards with `hover:shadow-lg` effect
- [ ] Detail report cards have consistent header styling (icon + badge)
- [ ] Responsive grid layout (1 col mobile, 2 col tablet, 4/3/1 desktop)
- [ ] Sticky header with z-index: 10
- [ ] Section headers use `text-lg font-semibold mb-4`
- [ ] Metric cards use MetricCard component (not custom implementation)
- [ ] Quick access buttons navigate to correct tab: `onClick={() => setActiveView('tab')}`
- [ ] For Technician Reports: visual separation (primary vs [CONTEXT] badge + muted color)
- [ ] All icons match role color scheme
- [ ] All badges match role color scheme
- [ ] Test responsive layout on mobile/tablet/desktop

