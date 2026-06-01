import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { AlertTriangle, AlertCircle, TrendingDown } from 'lucide-react';
import type { Exercise } from '../../data/exercises';
import { detectInjuryRisk } from '../../utils/smartAlgorithms';

interface InjuryRiskAlertsProps {
  workoutHistory: any[];
  exercises: Exercise[];
}

export function InjuryRiskAlerts({
  workoutHistory,
  exercises,
}: InjuryRiskAlertsProps) {
  const risks = useMemo(() => {
    return detectInjuryRisk(workoutHistory, exercises);
  }, [workoutHistory, exercises]);

  if (risks.length === 0) return null;

  const highRiskCount = risks.filter(r => r.riskLevel === 'high').length;
  const mediumRiskCount = risks.filter(r => r.riskLevel === 'medium').length;

  return (
    <Card className="border-red-200/50 dark:border-red-900/30 bg-gradient-to-r from-red-50/30 to-orange-50/30 dark:from-red-950/20 dark:to-orange-950/20">
      <CardHeader className="pb-2">
        <div className="flex items-start gap-2">
          {highRiskCount > 0 ? (
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          )}
          <CardTitle className="text-sm font-medium text-red-900 dark:text-red-200">
            Injury Risk {highRiskCount > 0 ? 'Detection' : 'Alert'}
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {highRiskCount > 0 && (
          <div className="bg-red-100/50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/50 rounded-lg p-2.5">
            <p className="text-xs font-medium text-red-800 dark:text-red-300 mb-1">
              🚨 High Risk: {highRiskCount} area{highRiskCount > 1 ? 's' : ''} at elevated injury risk
            </p>
            <p className="text-xs text-red-700 dark:text-red-400">
              Consider implementing recommended changes immediately to prevent overuse injuries.
            </p>
          </div>
        )}

        {risks.map((risk, i) => (
          <div
            key={i}
            className={`rounded-lg p-2.5 border ${
              risk.riskLevel === 'high'
                ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/40'
                : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40'
            }`}
          >
            <div className="flex items-start gap-2">
              <TrendingDown className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                risk.riskLevel === 'high'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${
                  risk.riskLevel === 'high'
                    ? 'text-red-900 dark:text-red-200'
                    : 'text-amber-900 dark:text-amber-200'
                }`}>
                  {risk.exercise}
                </p>
                <ul className="mt-1.5 space-y-0.5">
                  {risk.patterns.map((pattern, j) => (
                    <li key={j} className={`text-xs ${
                      risk.riskLevel === 'high'
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}>
                      • {pattern}
                    </li>
                  ))}
                </ul>
                <p className={`text-xs mt-2 font-medium ${
                  risk.riskLevel === 'high'
                    ? 'text-red-800 dark:text-red-300'
                    : 'text-amber-800 dark:text-amber-300'
                }`}>
                  → {risk.recommendation}
                </p>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
