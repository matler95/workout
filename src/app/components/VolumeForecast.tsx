import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { AlertCircle, TrendingUp } from 'lucide-react';
import type { VolumeEntry } from '../../utils/api';

interface VolumeChartData {
  week: number;
  volume: number;
  trend?: string;
}

interface VolumeForecasterProps {
  volumeData: VolumeEntry[];
  selectedMuscle?: string;
}

export function VolumeForecast({ volumeData, selectedMuscle }: VolumeForecasterProps) {
  const chartData = useMemo(() => {
    if (!volumeData || volumeData.length === 0) return [];

    // Group by week and calculate volume
    const volumeByWeek: Record<number, number> = {};
    
    volumeData.forEach((entry, idx) => {
      const week = Math.floor(idx / 7);
      volumeByWeek[week] = (volumeByWeek[week] || 0) + (entry.total_sets || 1);
    });

    // Convert to chart format
    return Object.entries(volumeByWeek)
      .map(([week, volume]) => ({
        week: parseInt(week) + 1,
        volume,
      }))
      .sort((a, b) => a.week - b.week);
  }, [volumeData]);

  if (!chartData.length) {
    return (
      <Card className="border-blue-200 dark:border-blue-800/30">
        <CardHeader>
          <CardTitle className="text-sm">Weekly Volume Forecast</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">Need more workout data for volume forecasting</p>
        </CardContent>
      </Card>
    );
  }

  // Calculate trend
  const recentVolumes = chartData.slice(-4);
  const avgRecent = recentVolumes.reduce((sum, d) => sum + d.volume, 0) / recentVolumes.length;
  const avgPrevious = chartData.slice(-8, -4).length > 0
    ? chartData.slice(-8, -4).reduce((sum, d) => sum + d.volume, 0) / 4
    : avgRecent;
  
  const trendPercent = avgPrevious > 0 ? ((avgRecent - avgPrevious) / avgPrevious) * 100 : 0;
  const trend = trendPercent > 5 ? 'increasing' : trendPercent < -5 ? 'decreasing' : 'stable';

  // Forecast next 2 weeks (simple linear projection)
  const lastWeek = chartData[chartData.length - 1];
  const secondLastWeek = chartData[chartData.length - 2];
  const slope = lastWeek && secondLastWeek ? lastWeek.volume - secondLastWeek.volume : 0;

  const forecastedData = [...chartData];
  let currentVol = lastWeek?.volume || avgRecent;
  for (let i = 1; i <= 2; i++) {
    currentVol = Math.max(10, currentVol + slope);
    forecastedData.push({
      week: lastWeek!.week + i,
      volume: Math.round(currentVol),
    });
  }

  return (
    <Card className="border-blue-200 dark:border-blue-800/30 bg-blue-50/30 dark:bg-blue-950/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            Weekly Volume Forecast
          </CardTitle>
          <span className={`text-xs font-medium px-2 py-1 rounded ${
            trend === 'increasing' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : trend === 'decreasing' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
          }`}>
            {trend === 'increasing' ? '↗ ' : trend === 'decreasing' ? '↘ ' : '→ '}
            {trend}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="h-32 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={forecastedData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis 
                dataKey="week" 
                stroke="rgb(107 114 128)"
                style={{ fontSize: '12px' }}
                tick={{ fill: 'rgb(107 114 128)' }}
              />
              <YAxis 
                stroke="rgb(107 114 128)"
                style={{ fontSize: '12px' }}
                tick={{ fill: 'rgb(107 114 128)' }}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  padding: '6px',
                }}
                formatter={(value: number) => [`${value} sets`, 'Volume']}
              />
              <Line 
                type="monotone" 
                dataKey="volume" 
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: '#3b82f6', r: 3 }}
                name="Volume"
              />
              {/* Forecast line (dashed) */}
              <Line 
                type="monotone" 
                dataKey="volume" 
                stroke="#a78bfa"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                name="Forecast"
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-slate-800/50 rounded-lg p-2.5 text-xs space-y-1">
          <p className="font-medium text-foreground">
            Current: <span className="text-blue-600 dark:text-blue-400">{Math.round(avgRecent)} sets/week</span>
          </p>
          <p className="text-muted-foreground">
            Trend: {trend === 'increasing' ? '↗ Training volume increasing - good progression'
              : trend === 'decreasing' ? '↘ Training volume decreasing - consider increasing frequency'
              : '→ Training volume stable - maintaining consistency'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
