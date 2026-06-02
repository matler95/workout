/**
 * Recharts configuration helpers — use these wherever you render charts.
 *
 * Drop this file at src/utils/chartConfig.ts
 * Import the helpers into Progress.tsx and Dashboard.tsx.
 */

/** Axis tick props — uses CSS variables so they work in light and dark mode */
export const axisTickProps = {
  fontSize: 11,
  fill: 'var(--muted-foreground)',
} as const;

/** Consistent tooltip style matching the app's card design */
export const tooltipStyle = {
  contentStyle: {
    background: 'var(--card)',
    border: '0.5px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--foreground)',
    fontSize: '12px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  },
  labelStyle: {
    color: 'var(--foreground)',
    fontWeight: 500,
  },
  itemStyle: {
    color: 'var(--muted-foreground)',
  },
} as const;

/** CartesianGrid style */
export const gridStyle = {
  stroke: 'var(--border)',
  strokeOpacity: 0.6,
} as const;
