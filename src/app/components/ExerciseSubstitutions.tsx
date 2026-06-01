import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { AlertCircle, Zap, CheckCircle } from 'lucide-react';
import type { Exercise } from '../../data/exercises';
import type { UserProfile } from '../../utils/api';
import { suggestSubstitutes } from '../../utils/smartAlgorithms';
import { exerciseDatabase } from '../../data/exercises';

interface ExerciseSubstitutionsProps {
  exercise: Exercise;
  profile?: UserProfile;
  onSubstitute?: (newExercise: Exercise) => void;
}

export function ExerciseSubstitutions({
  exercise,
  profile,
  onSubstitute,
}: ExerciseSubstitutionsProps) {
  const [expanded, setExpanded] = useState(false);

  const substitutes = useMemo(() => {
    if (!profile) return [];
    return suggestSubstitutes(exercise, profile, exerciseDatabase);
  }, [exercise, profile]);

  if (!substitutes.length) return null;

  return (
    <Card className="border-blue-200 dark:border-blue-800/30 bg-blue-50/30 dark:bg-blue-950/20">
      <CardHeader className="pb-2">
        <div className="flex items-start gap-2">
          <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex-1 text-left"
          >
            <CardTitle className="text-sm font-medium text-blue-900 dark:text-blue-200">
              Similar exercises available
            </CardTitle>
          </button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-2">
          <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
            Consider these alternatives for {exercise.name}:
          </p>
          
          {substitutes.map((sub, i) => (
            <div
              key={i}
              className="bg-white dark:bg-slate-800/50 rounded-lg p-2.5 border border-blue-100 dark:border-blue-900/30"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="font-medium text-sm">{sub.exercise.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{sub.reason}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {sub.exercise.primaryMuscles.map(m => (
                      <Badge key={m} variant="secondary" className="text-xs">
                        {m.replace(/_/g, ' ')}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    {sub.matchScore}%
                  </div>
                  {onSubstitute && (
                    <button
                      onClick={() => onSubstitute(sub.exercise)}
                      className="text-xs mt-1 px-2 py-1 rounded bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/50 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 transition-colors"
                    >
                      Use this
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
