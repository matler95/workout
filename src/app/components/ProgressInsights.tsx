/**
 * Progress Insights Component
 *
 * Shows:
 * - Bodyweight trend predictions
 * - Work capacity trends
 * - Muscle balance indicators
 * - Volume forecasts
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { TrendingUp, TrendingDown, BarChart3, Gauge } from 'lucide-react';

interface BodyweightPrediction {
  projected: number;
  slopePerWeek: number;
  confidence: number;
}

interface WorkCapacity {
  totalWeeklyVolume: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  confidence: number;
}

interface MuscleBalance {
  balance: Record<string, number>;
  mostTrained: string;
  leastTrained: string;
  isBalanced: boolean;
}

interface ProgressInsightsProps {
  bodyweightPrediction?: BodyweightPrediction;
  workCapacity?: WorkCapacity;
  muscleBalance?: MuscleBalance;
  units?: 'metric' | 'imperial';
}

export function ProgressInsights({
  bodyweightPrediction,
  workCapacity,
  muscleBalance,
  units = 'metric',
}: ProgressInsightsProps) {
  const formatWeight = (kg: number) => {
    return units === 'imperial' ? Math.round(kg * 2.20462) : Math.round(kg * 10) / 10;
  };

  return (
    <div className="space-y-3">
      {/* Bodyweight Prediction */}
      {bodyweightPrediction && bodyweightPrediction.confidence > 0 && (
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                </div>
                Bodyweight Projection
              </CardTitle>
              <Badge variant="secondary" className="text-xs">
                {Math.round(bodyweightPrediction.confidence * 100)}% confidence
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">In 60 days</p>
                <p className="text-2xl font-bold">
                  {formatWeight(bodyweightPrediction.projected)} <span className="text-sm text-muted-foreground">{units === 'imperial' ? 'lbs' : 'kg'}</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Weekly trend</p>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">
                    {bodyweightPrediction.slopePerWeek > 0 ? '+' : ''}
                    {formatWeight(bodyweightPrediction.slopePerWeek)}
                    <span className="text-xs text-muted-foreground"> per week</span>
                  </p>
                  {bodyweightPrediction.slopePerWeek > 0.1 && (
                    <TrendingUp className="w-4 h-4 text-rose-500" />
                  )}
                  {bodyweightPrediction.slopePerWeek < -0.1 && (
                    <TrendingDown className="w-4 h-4 text-emerald-600" />
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Work Capacity */}
      {workCapacity && (
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Gauge className="w-3.5 h-3.5 text-purple-600" />
              </div>
              Work Capacity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Weekly volume</p>
                <p className="text-2xl font-bold">{workCapacity.totalWeeklyVolume} <span className="text-sm text-muted-foreground">sets</span></p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">Trend</p>
                <Badge
                  variant={
                    workCapacity.trend === 'increasing' ? 'default' :
                    workCapacity.trend === 'decreasing' ? 'secondary' :
                    'outline'
                  }
                >
                  {workCapacity.trend === 'increasing' && '📈 Improving'}
                  {workCapacity.trend === 'decreasing' && '📉 Declining'}
                  {workCapacity.trend === 'stable' && '➡️ Stable'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Muscle Balance */}
      {muscleBalance && Object.keys(muscleBalance.balance).length > 0 && (
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <BarChart3 className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                Muscle Balance
              </CardTitle>
              <Badge variant={muscleBalance.isBalanced ? 'default' : 'secondary'} className="text-xs">
                {muscleBalance.isBalanced ? '✅ Balanced' : '⚠️ Unbalanced'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="space-y-2">
                {Object.entries(muscleBalance.balance).slice(0, 4).map(([muscle, percent]) => (
                  <div key={muscle}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{muscle}</span>
                      <span className="font-semibold">{percent}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {Object.keys(muscleBalance.balance).length > 4 && (
                <p className="text-xs text-muted-foreground">
                  +{Object.keys(muscleBalance.balance).length - 4} more muscle groups
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
